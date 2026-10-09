import { randomUUID } from 'node:crypto';
import type {
  CleanupPreviewCandidate,
  CleanupPreviewSource,
  CleanerPreviewResponse,
} from '@shared/ipc/contracts';
import type { CleanupCandidateDraft } from './preview';

/** Актуальность preview-сессии: после истечения удаление невозможно. */
export const CLEANUP_SESSION_TTL_MS = 5 * 60_000;

export type PreviewSession = {
  id: string;
  expiresAt: number;
  candidates: Map<string, CleanupPreviewCandidate>;
};

export type SessionStoreDeps = {
  ttlMs?: number;
  now?: () => number;
  randomId?: () => string;
};

/** Единственная активная preview-сессия; новая уничтожает предыдущую (ADR 0017). */
export class PreviewSessionStore {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly randomId: () => string;
  private current: PreviewSession | null = null;

  constructor(deps: SessionStoreDeps = {}) {
    this.ttlMs = deps.ttlMs ?? CLEANUP_SESSION_TTL_MS;
    this.now = deps.now ?? Date.now;
    this.randomId = deps.randomId ?? randomUUID;
  }

  /** Создаёт сессию с уникальными ID кандидатов; прежняя сессия недействительна. */
  create(
    candidates: readonly CleanupCandidateDraft[],
    sources: CleanupPreviewSource[]
  ): CleanerPreviewResponse {
    const sessionId = this.randomId();
    const createdAt = this.now();
    const map = new Map<string, CleanupPreviewCandidate>();
    let estimatedBytes = 0;
    for (const candidate of candidates) {
      const id = `${sessionId}:${this.randomId()}`;
      map.set(id, { ...candidate, id });
      estimatedBytes += candidate.sizeBytes;
    }
    const expiresAt = createdAt + this.ttlMs;
    this.current = { id: sessionId, expiresAt, candidates: map };
    return {
      sessionId,
      candidates: [...map.values()],
      estimatedBytes,
      sources,
      expiresAt,
    };
  }

  /** Действующая сессия по ID; чужой или просроченный ID → null (сессия уничтожается). */
  getActive(sessionId: string): PreviewSession | null {
    const session = this.current;
    if (!session || session.id !== sessionId) {
      return null;
    }
    if (this.now() >= session.expiresAt) {
      this.current = null;
      return null;
    }
    return session;
  }

  /** Резолв ID кандидатов внутри действующей сессии; null — кандидат не найден. */
  resolve(session: PreviewSession, candidateId: string): CleanupPreviewCandidate | null {
    return session.candidates.get(candidateId) ?? null;
  }
}
