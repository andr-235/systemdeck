import type { CleanupItemResult, CleanupPreviewSource } from '@shared/ipc/contracts';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { toCleanupIpcError } from './errors';
import { cleanerRules, isRecycleVolumePath, type CleanupRule } from './rules';
import type { RecycleShell } from './recycleShell';

/** Агрегированный кандидат корзины: путь обозначает корень корзины тома, не файл. */
export type RecycleCandidate = { path: string; sizeBytes: number; category: 'recycle-bin' };

export type RecyclePreview = { candidates: RecycleCandidate[]; source: CleanupPreviewSource };

function source(
  status: CleanupPreviewSource['status'],
  candidateCount: number,
  estimatedBytes: number,
  reason?: string
): CleanupPreviewSource {
  return {
    category: 'recycle-bin',
    status,
    ...(reason === undefined ? {} : { reason }),
    candidateCount,
    estimatedBytes,
    inaccessibleDirectories: 0,
  };
}

function volumeLabel(volumeRoot: string): string {
  return volumeRoot.slice(0, 2);
}

function recyclePathFor(volumeRoot: string): string {
  return `${volumeRoot}$Recycle.Bin`;
}

/**
 * Preview корзины только через Shell: один агрегат на опрошенный том; том с неизвестным
 * размером кандидатом не становится — неизвестное не подменяется оценкой (issue #57).
 * Без recycle-правила в наборе источник — `unavailable`, кандидаты не создаются.
 */
export async function buildRecyclePreview(
  shell: RecycleShell,
  rules: readonly CleanupRule[] = cleanerRules()
): Promise<RecyclePreview> {
  if (!rules.some((rule) => rule.kind === 'recycle-volume')) {
    return {
      candidates: [],
      source: source('unavailable', 0, 0, 'Корзина не входит в выбранные правила очистки'),
    };
  }
  let volumes: string[];
  try {
    volumes = await shell.listVolumes();
  } catch (error) {
    const reason =
      error instanceof Error ? error.message.split('\n')[0] : 'Shell недоступен на этой системе';
    return { candidates: [], source: source('unavailable', 0, 0, `Корзина недоступна: ${reason}`) };
  }
  if (volumes.length === 0) {
    return {
      candidates: [],
      source: source('unavailable', 0, 0, 'Shell не вернул фиксированные тома'),
    };
  }
  const candidates: RecycleCandidate[] = [];
  const failedVolumes: string[] = [];
  for (const volumeRoot of volumes) {
    const state = await shell.query(volumeRoot);
    if (!state.ok) {
      failedVolumes.push(volumeLabel(volumeRoot));
      continue;
    }
    if (state.sizeBytes === 0 && state.itemCount === 0) {
      continue;
    }
    candidates.push({
      path: recyclePathFor(volumeRoot),
      sizeBytes: state.sizeBytes,
      category: 'recycle-bin',
    });
  }
  if (failedVolumes.length === volumes.length) {
    return {
      candidates: [],
      source: source('unavailable', 0, 0, 'Shell не смог запросить корзину ни одного тома'),
    };
  }
  const estimatedBytes = candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0);
  if (failedVolumes.length > 0) {
    return {
      candidates,
      source: source(
        'partial',
        candidates.length,
        estimatedBytes,
        `Часть томов не опрошена: ${failedVolumes.join(', ')}`
      ),
    };
  }
  return {
    candidates,
    source: source(candidates.length === 0 ? 'empty' : 'ok', candidates.length, estimatedBytes),
  };
}

/**
 * Агрегированная очистка корзины выбранного тома: замер до, `Clear-RecycleBin`, замер после.
 * `bytesFreed` — разница фактических замеров; оценка preview в отчёт не переносится.
 */
export async function clearRecycleVolume(
  path: string,
  shell: RecycleShell
): Promise<CleanupItemResult> {
  if (!isRecycleVolumePath(path)) {
    return { path, outcome: 'skipped', bytesFreed: 0, code: IPC_ERROR_CODES.CLEAN_OUTSIDE_RULES };
  }
  const volumeRoot = `${path.charAt(0)}:\\`;
  const before = await shell.query(volumeRoot);
  if (!before.ok) {
    return {
      path,
      outcome: 'failed',
      bytesFreed: 0,
      error: { code: IPC_ERROR_CODES.CLEAN_SHELL_UNAVAILABLE, message: before.reason },
    };
  }
  if (before.sizeBytes === 0 && before.itemCount === 0) {
    return { path, outcome: 'skipped', bytesFreed: 0, code: IPC_ERROR_CODES.CLEAN_ENTRY_INVALID };
  }
  try {
    await shell.clear(volumeRoot);
  } catch (error) {
    return { path, outcome: 'failed', bytesFreed: 0, error: toCleanupIpcError(error) };
  }
  const after = await shell.query(volumeRoot);
  if (!after.ok) {
    return {
      path,
      outcome: 'failed',
      bytesFreed: 0,
      error: {
        code: IPC_ERROR_CODES.CLEAN_SIZE_UNVERIFIED,
        message: 'Корзина очищена, но фактический размер не подтверждён',
      },
    };
  }
  return { path, outcome: 'deleted', bytesFreed: Math.max(0, before.sizeBytes - after.sizeBytes) };
}
