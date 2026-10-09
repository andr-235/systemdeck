import type { CleanupCategory, CleanupPreviewSource } from '@shared/ipc/contracts';
import { buildCleanupCandidates } from './candidates';
import { buildRecyclePreview } from './recycleBin';
import { cleanerRules, rootsForCategory, type CleanupRule } from './rules';
import { nodeRecycleShell, type RecycleShell } from './recycleShell';
import { buildPreviewSource } from './sourceStatus';
import { collectCleanupCandidates, nodeCleanerFs, type CleanerFs } from './walker';

/** Черновик кандидата: ID присваивает preview-сессия при создании (GUD-001). */
export type CleanupCandidateDraft = {
  path: string;
  sizeBytes: number;
  category: CleanupCategory;
  /** Параметры файла на момент превью: удаление сверяет их повторно (issue #56). */
  mtimeMs?: number;
};

export type CleanupPreview = {
  candidates: CleanupCandidateDraft[];
  sources: CleanupPreviewSource[];
};

export type PreviewOptions = {
  now?: number;
  rules?: readonly CleanupRule[];
  /** Shell-граница корзины: в тестах подменяется фейком (PAT-001). */
  recycleShell?: RecycleShell;
};

/** Обход allow-корней каждой категории; кандидат другой категории в её источник не входит. */
export async function buildCleanupPreview(
  categories: readonly CleanupCategory[],
  fs: CleanerFs = nodeCleanerFs,
  options: PreviewOptions = {}
): Promise<CleanupPreview> {
  const rules = options.rules ?? cleanerRules();
  const now = options.now ?? Date.now();
  const shell = options.recycleShell ?? nodeRecycleShell;
  const perCategory = await Promise.all(
    categories.map((category) => collectCategory(category, { fs, rules, now, shell }))
  );
  return {
    candidates: perCategory.flatMap((part) => part.candidates),
    sources: perCategory.map((part) => part.source),
  };
}

type CollectContext = {
  fs: CleanerFs;
  rules: readonly CleanupRule[];
  now: number;
  shell: RecycleShell;
};

/** Источник черновика: и файловый кандидат, и агрегат корзины сводятся к одному виду. */
type DraftSource = {
  path: string;
  sizeBytes: number;
  category: CleanupCategory;
  mtimeMs?: number;
};

async function collectCategory(
  category: CleanupCategory,
  context: CollectContext
): Promise<{ candidates: CleanupCandidateDraft[]; source: CleanupPreviewSource }> {
  // Корзина — агрегат по томам через Shell: файловый обход её корня не выполняется (issue #57).
  if (category === 'recycle-bin') {
    const { candidates, source } = await buildRecyclePreview(context.shell);
    return { candidates: candidates.map(toDraft), source };
  }
  const roots = rootsForCategory(category, context.rules);
  const collected = await collectCleanupCandidates(roots, context.fs);
  const built = buildCleanupCandidates(collected.entries, {
    rules: context.rules,
    now: context.now,
  });
  const candidates: CleanupCandidateDraft[] = built.candidates
    .filter((candidate) => candidate.category === category)
    .map(toDraft);
  return {
    candidates,
    source: buildPreviewSource({ category, rules: context.rules, roots, collected, candidates }),
  };
}

function toDraft(candidate: DraftSource): CleanupCandidateDraft {
  return {
    path: candidate.path,
    sizeBytes: candidate.sizeBytes,
    category: candidate.category,
    ...(candidate.mtimeMs === undefined ? {} : { mtimeMs: candidate.mtimeMs }),
  };
}
