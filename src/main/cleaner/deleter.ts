import { lstat, unlink } from 'node:fs/promises';
import type { CleanupItemResult, CleanupPreviewCandidate } from '@shared/ipc/contracts';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { toCleanupIpcError } from './errors';
import { isDeletionAllowed } from './candidates';
import { cleanerRules, type CleanupRule } from './rules';

/** Граница ФС удаления: node-fs по умолчанию, fake для тестов (прецедент ScanFs). */
export interface CleanerDeleteFs {
  lstat(path: string): Promise<{
    size: number;
    mtimeMs: number;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }>;
  unlink(path: string): Promise<void>;
}

export const nodeCleanerDeleteFs: CleanerDeleteFs = {
  lstat: async (path) => {
    const info = await lstat(path);
    return {
      size: info.size,
      mtimeMs: info.mtimeMs,
      isFile: () => info.isFile(),
      isSymbolicLink: () => info.isSymbolicLink(),
    };
  },
  unlink: async (path) => {
    await unlink(path);
  },
};

export type RunCleanupDeps = {
  isCancelled: () => boolean;
  fs?: CleanerDeleteFs;
  rules?: readonly CleanupRule[];
  /** Вызывается после каждого обработанного элемента: накопление отчёта и прогресс. */
  onItem?: (item: CleanupItemResult, processed: number, freedBytes: number) => void;
};

/** Удаление строго по явно выбранным кандидатам с повторной валидацией каждого (SEC-002). */
export async function runCleanup(
  selected: readonly CleanupPreviewCandidate[],
  deps: RunCleanupDeps
): Promise<CleanupItemResult[]> {
  const fs = deps.fs ?? nodeCleanerDeleteFs;
  const rules = deps.rules ?? cleanerRules();
  const items: CleanupItemResult[] = [];
  let freedBytes = 0;
  for (const candidate of selected) {
    if (deps.isCancelled()) {
      break;
    }
    const item = await deleteOne(candidate, fs, rules);
    items.push(item);
    if (item.outcome === 'deleted') {
      freedBytes += item.bytesFreed;
    }
    deps.onItem?.(item, items.length, freedBytes);
  }
  return items;
}

/** Параметры файла обязаны совпасть с превью: иначе файл изменился после preview (issue #56). */
function matchesPreview(
  candidate: CleanupPreviewCandidate,
  info: { size: number; mtimeMs: number }
): boolean {
  if (info.size !== candidate.sizeBytes) {
    return false;
  }
  return candidate.mtimeMs === undefined || info.mtimeMs === candidate.mtimeMs;
}

async function deleteOne(
  candidate: CleanupPreviewCandidate,
  fs: CleanerDeleteFs,
  rules: readonly CleanupRule[]
): Promise<CleanupItemResult> {
  const path = candidate.path;
  const verdict = isDeletionAllowed(path, rules);
  if (!verdict.allowed) {
    return { path, outcome: 'skipped', bytesFreed: 0, code: verdict.code };
  }
  let info: Awaited<ReturnType<CleanerDeleteFs['lstat']>>;
  try {
    info = await fs.lstat(path);
  } catch {
    // Файл исчез или недоступен после preview: подмена/TOCTOU — ничего не удаляем.
    return { path, outcome: 'skipped', bytesFreed: 0, code: IPC_ERROR_CODES.CLEAN_ENTRY_INVALID };
  }
  if (info.isSymbolicLink() || !info.isFile() || !matchesPreview(candidate, info)) {
    return { path, outcome: 'skipped', bytesFreed: 0, code: IPC_ERROR_CODES.CLEAN_ENTRY_INVALID };
  }
  try {
    await fs.unlink(path);
  } catch (error) {
    return { path, outcome: 'failed', bytesFreed: 0, error: toCleanupIpcError(error) };
  }
  return { path, outcome: 'deleted', bytesFreed: info.size };
}
