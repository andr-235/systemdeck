import type { CleanupCategory, CleanupPreviewSource } from '@shared/ipc/contracts';
import { buildCleanupCandidates } from './candidates';
import { cleanerRules, rootsForCategory, type CleanupRule } from './rules';
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
};

/** Обход allow-корней каждой категории; кандидат другой категории в её источник не входит. */
export async function buildCleanupPreview(
  categories: readonly CleanupCategory[],
  fs: CleanerFs = nodeCleanerFs,
  options: PreviewOptions = {}
): Promise<CleanupPreview> {
  const rules = options.rules ?? cleanerRules();
  const now = options.now ?? Date.now();
  const perCategory = await Promise.all(categories.map((c) => collectCategory(c, fs, rules, now)));
  return {
    candidates: perCategory.flatMap((part) => part.candidates),
    sources: perCategory.map((part) => part.source),
  };
}

async function collectCategory(
  category: CleanupCategory,
  fs: CleanerFs,
  rules: readonly CleanupRule[],
  now: number
): Promise<{ candidates: CleanupCandidateDraft[]; source: CleanupPreviewSource }> {
  const roots = rootsForCategory(category, rules);
  const collected = await collectCleanupCandidates(roots, fs);
  const built = buildCleanupCandidates(collected.entries, { rules, now });
  const candidates: CleanupCandidateDraft[] = built.candidates
    .filter((candidate) => candidate.category === category)
    .map((candidate) => ({
      path: candidate.path,
      sizeBytes: candidate.sizeBytes,
      category: candidate.category,
      mtimeMs: candidate.mtimeMs,
    }));
  return {
    candidates,
    source: buildPreviewSource({ category, rules, roots, collected, candidates }),
  };
}
