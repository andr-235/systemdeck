import { randomUUID } from 'node:crypto';
import type {
  CleanupCategory,
  CleanupItemResult,
  CleanupPreviewCandidate,
  CleanupProgressEvent,
  CleanerPreviewResponse,
} from '@shared/ipc/contracts';
import { IPC_ERROR_CODES, toErrorParts } from '@shared/ipc/errors';
import { getLogger } from '../logger';
import { isDeletionAllowed } from './candidates';
import { runCleanup, type CleanerDeleteFs } from './deleter';
import { buildCleanupPreview } from './preview';
import { PreviewSessionStore, type PreviewSession } from './previewSession';
import { CleanupProgressEmitter } from './progress';
import { buildCleanupReport } from './report';
import { resolveCleanupRules } from './resolveRules';
import type { CleanupRule } from './rules';
import type { RecycleShell } from './recycleShell';
import { nodeCleanerFs, type CleanerFs } from './walker';

const logger = getLogger('cleaner');

type ActiveOperation = { operationId: string; sessionId: string; cancelled: boolean };

export type CleanerManagerDeps = {
  send: (event: CleanupProgressEvent) => void;
  throttleMs?: number;
  now?: () => number;
  randomId?: () => string;
  sessionTtlMs?: number;
  /** Инжекции границ ФС и Shell для тестов. */
  previewFs?: CleanerFs;
  deleteFs?: CleanerDeleteFs;
  recycleShell?: RecycleShell;
};

function cleanerError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** Оркестратор Cleaner: preview-сессии, один активный цикл удаления, отмена, прогресс. */
export class CleanerManager {
  private readonly sessions: PreviewSessionStore;
  private readonly emitter: CleanupProgressEmitter;
  private readonly previewFs: CleanerFs | undefined;
  private readonly deleteFs: CleanerDeleteFs | undefined;
  private readonly recycleShell: RecycleShell | undefined;
  private readonly randomId: () => string;
  private active: ActiveOperation | null = null;

  constructor(deps: CleanerManagerDeps) {
    this.sessions = new PreviewSessionStore({ ttlMs: deps.sessionTtlMs, now: deps.now });
    this.emitter = new CleanupProgressEmitter({
      // Push best-effort: сбой отправки (webContents уничтожается при закрытии окна)
      // не должен ни ронять операцию удаления, ни порождать unhandled rejection.
      send: (event) => {
        try {
          deps.send(event);
        } catch (error) {
          logger.error('cleaner progress send failed', { error: toErrorParts(error) });
        }
      },
      throttleMs: deps.throttleMs,
      now: deps.now,
    });
    this.previewFs = deps.previewFs;
    this.deleteFs = deps.deleteFs;
    this.recycleShell = deps.recycleShell;
    this.randomId = deps.randomId ?? randomUUID;
  }

  isActive(): boolean {
    return this.active !== null;
  }

  /** Превью по категориям; во время удаления отклоняется (REQ-005). */
  async preview(categories: readonly CleanupCategory[]): Promise<CleanerPreviewResponse> {
    this.assertNoActive('Операция очистки уже выполняется');
    const { candidates, sources } = await buildCleanupPreview(categories, this.previewFs, {
      recycleShell: this.recycleShell,
    });
    // Превью собиралось долго: если удаление стартовало за это время — сессию не создаём.
    this.assertNoActive('Операция очистки уже выполняется');
    return this.sessions.create(candidates, sources);
  }

  /** Старт удаления: только sessionId + ID кандидатов, raw path отсутствует (SEC-001). */
  async startDelete(request: {
    sessionId: string;
    candidateIds: string[];
  }): Promise<{ operationId: string }> {
    this.assertNoActive('Операция очистки уже выполняется');
    const session = this.sessions.getActive(request.sessionId);
    if (!session) {
      throw cleanerError(
        IPC_ERROR_CODES.CLEAN_SESSION_NOT_FOUND,
        'Предпросмотр недействителен или истёк'
      );
    }
    const selected = this.resolveSelected(session, request.candidateIds);
    // Свежие правила с повторным обнаружением профилей: Main перепроверяет allow-правило
    // по актуальному состоянию ФС, а не по данным превью (issue #58).
    const { rules } = await resolveCleanupRules(this.previewFs ?? nodeCleanerFs);
    // Пока выполнялось обнаружение, операция могла стартовать из другого вызова.
    this.assertNoActive('Операция очистки уже выполняется');
    for (const candidate of selected) {
      const verdict = isDeletionAllowed(candidate.path, rules);
      if (!verdict.allowed) {
        throw cleanerError(verdict.code, 'Выбранный кандидат более не подлежит удалению');
      }
    }
    const operationId = this.randomId();
    const active: ActiveOperation = { operationId, sessionId: session.id, cancelled: false };
    this.active = active;
    void this.runOperation(active, selected, rules);
    return { operationId };
  }

  /** Идемпотентная отмена: чужой/завершённый operationId — безопасный no-op (REQ-007). */
  cancel(operationId: string): void {
    const active = this.active;
    if (active && active.operationId === operationId) {
      active.cancelled = true;
      logger.info('cleaner cancellation requested', { operationId });
    }
  }

  private assertNoActive(message: string): void {
    if (this.active) {
      throw cleanerError(IPC_ERROR_CODES.CLEAN_ALREADY_ACTIVE, message);
    }
  }

  private resolveSelected(
    session: PreviewSession,
    candidateIds: string[]
  ): CleanupPreviewCandidate[] {
    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      throw cleanerError(IPC_ERROR_CODES.CLEAN_EMPTY_SELECTION, 'Не выбраны кандидаты');
    }
    const seen = new Set<string>();
    const selected: CleanupPreviewCandidate[] = [];
    for (const id of candidateIds) {
      if (typeof id !== 'string') {
        throw cleanerError(
          IPC_ERROR_CODES.CLEAN_UNKNOWN_CANDIDATE,
          'Кандидат не принадлежит сессии предпросмотра'
        );
      }
      if (seen.has(id)) {
        continue;
      }
      const candidate = this.sessions.resolve(session, id);
      if (!candidate) {
        throw cleanerError(
          IPC_ERROR_CODES.CLEAN_UNKNOWN_CANDIDATE,
          'Кандидат не принадлежит сессии предпросмотра'
        );
      }
      seen.add(id);
      selected.push(candidate);
    }
    return selected;
  }

  private async runOperation(
    active: ActiveOperation,
    selected: CleanupPreviewCandidate[],
    rules: readonly CleanupRule[]
  ): Promise<void> {
    const total = selected.length;
    const items: CleanupItemResult[] = [];
    let freedBytes = 0;
    const emitRunning = (phase: 'validating' | 'deleting', processed: number): void => {
      this.emitter.emitRunning({
        operationId: active.operationId,
        sessionId: active.sessionId,
        phase,
        processed,
        total,
        freedBytes,
      });
    };
    const emitTerminal = (status: 'completed' | 'cancelled' | 'failed'): void => {
      this.emitter.emitTerminal({
        operationId: active.operationId,
        sessionId: active.sessionId,
        status,
        report: buildCleanupReport(items),
      });
    };
    try {
      emitRunning('validating', 0);
      await runCleanup(selected, {
        isCancelled: () => active.cancelled,
        fs: this.deleteFs,
        recycleShell: this.recycleShell,
        rules,
        onItem: (item, processed, freed) => {
          items.push(item);
          freedBytes = freed;
          emitRunning('deleting', processed);
        },
      });
      emitTerminal(items.length < total ? 'cancelled' : 'completed');
    } catch (error) {
      logger.error('cleaner operation failed', {
        operationId: active.operationId,
        error: toErrorParts(error),
      });
      emitTerminal('failed');
    } finally {
      if (this.active === active) {
        this.active = null;
      }
    }
  }
}
