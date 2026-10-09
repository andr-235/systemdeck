import type { CleanupCategory, CleanupPreviewSource } from '@shared/ipc/contracts';
import { buildCleanupCandidates } from './candidates';
import { CLEANER_RULES } from './rules';
import { collectCleanupCandidates, nodeCleanerFs, type CleanerFs } from './walker';

/** Черновик кандидата: ID присваивает preview-сессия при создании (GUD-001). */
export type CleanupCandidateDraft = {
  path: string;
  sizeBytes: number;
  category: CleanupCategory;
};

export type CleanupPreview = {
  candidates: CleanupCandidateDraft[];
  sources: CleanupPreviewSource[];
};

/** Allow-корни одной категории; Renderer корни не передаёт (CON-004). */
function rootsForCategory(category: CleanupCategory): string[] {
  const roots = new Set<string>();
  for (const rule of CLEANER_RULES) {
    if (rule.category === category) {
      roots.add(rule.allowRoot);
    }
  }
  return [...roots];
}

function sourceStatus(
  candidateCount: number,
  inaccessibleDirectories: number
): CleanupPreviewSource['status'] {
  if (inaccessibleDirectories > 0) {
    return 'partial';
  }
  return candidateCount === 0 ? 'empty' : 'ok';
}

/** Обход allow-корней каждой категории; кандидат другой категории в её источник не входит. */
export async function buildCleanupPreview(
  categories: readonly CleanupCategory[],
  fs: CleanerFs = nodeCleanerFs
): Promise<CleanupPreview> {
  const perCategory = await Promise.all(categories.map((c) => collectCategory(c, fs)));
  return {
    candidates: perCategory.flatMap((part) => part.candidates),
    sources: perCategory.map((part) => part.source),
  };
}

async function collectCategory(
  category: CleanupCategory,
  fs: CleanerFs
): Promise<{ candidates: CleanupCandidateDraft[]; source: CleanupPreviewSource }> {
  const { entries, inaccessibleDirs } = await collectCleanupCandidates(
    rootsForCategory(category),
    fs
  );
  const own = buildCleanupCandidates(entries).candidates.filter((c) => c.category === category);
  const candidates: CleanupCandidateDraft[] = own.map((c) => ({
    path: c.path,
    sizeBytes: c.sizeBytes,
    category: c.category,
  }));
  const estimatedBytes = candidates.reduce((sum, c) => sum + c.sizeBytes, 0);
  return {
    candidates,
    source: {
      category,
      status: sourceStatus(candidates.length, inaccessibleDirs.length),
      candidateCount: candidates.length,
      estimatedBytes,
      inaccessibleDirectories: inaccessibleDirs.length,
    },
  };
}
