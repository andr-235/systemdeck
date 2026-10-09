import type {
  CleanupBrowser,
  CleanupCacheKind,
  CleanupCategory,
  CleanupPreviewSource,
} from '@shared/ipc/contracts';
import { EMPTY_BROWSER_DISCOVERY, type BrowserDiscovery } from './browserRoots';
import { buildCleanupCandidates } from './candidates';
import { buildRecyclePreview } from './recycleBin';
import { resolveCleanupRules } from './resolveRules';
import { rootsForCategory, type CleanupRule } from './rules';
import { nodeRecycleShell, type RecycleShell } from './recycleShell';
import { browserSourceStatus, buildPreviewSource } from './sourceStatus';
import type { Env } from './systemRoots';
import { collectCleanupCandidates, nodeCleanerFs, type CleanerFs } from './walker';

/** Черновик кандидата: ID присваивает preview-сессия при создании (GUD-001). */
export type CleanupCandidateDraft = {
  path: string;
  sizeBytes: number;
  category: CleanupCategory;
  /** Параметры файла на момент превью: удаление сверяет их повторно (issue #56). */
  mtimeMs?: number;
  /** Метаданные браузерного кэша из обнаружения Main (issue #58). */
  browser?: CleanupBrowser;
  profile?: string;
  cacheKind?: CleanupCacheKind;
};

export type CleanupPreview = {
  candidates: CleanupCandidateDraft[];
  sources: CleanupPreviewSource[];
};

export type PreviewOptions = {
  now?: number;
  rules?: readonly CleanupRule[];
  /** Снимок окружения для обнаружения профилей браузеров (в тестах — фейковый, PAT-001). */
  env?: Env;
  /** Shell-граница корзины: в тестах подменяется фейком (PAT-001). */
  recycleShell?: RecycleShell;
};

/** Обход allow-корней каждой категории; кандидат другой категории в её источник не входит. */
export async function buildCleanupPreview(
  categories: readonly CleanupCategory[],
  fs: CleanerFs = nodeCleanerFs,
  options: PreviewOptions = {}
): Promise<CleanupPreview> {
  const resolved =
    options.rules === undefined
      ? await resolveCleanupRules(fs, options.env)
      : { rules: options.rules, browser: EMPTY_BROWSER_DISCOVERY };
  const rules = resolved.rules;
  const now = options.now ?? Date.now();
  const shell = options.recycleShell ?? nodeRecycleShell;
  const perCategory = await Promise.all(
    categories.map((category) =>
      collectCategory(category, { fs, rules, now, shell, browser: resolved.browser })
    )
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
  browser: BrowserDiscovery;
};

/** Источник черновика: и файловый кандидат, и агрегат корзины сводятся к одному виду. */
type DraftSource = {
  path: string;
  sizeBytes: number;
  category: CleanupCategory;
  mtimeMs?: number;
  browser?: CleanupBrowser;
  profile?: string;
  cacheKind?: CleanupCacheKind;
};

async function collectCategory(
  category: CleanupCategory,
  context: CollectContext
): Promise<{ candidates: CleanupCandidateDraft[]; source: CleanupPreviewSource }> {
  // Корзина — агрегат по томам через Shell: файловый обход её корня не выполняется (issue #57).
  if (category === 'recycle-bin') {
    const { candidates, source } = await buildRecyclePreview(context.shell, context.rules);
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
  // browser-cache различает «браузер/профиль не найден» (empty) и «нет доступа» (issue #58).
  const status =
    category === 'browser-cache'
      ? browserSourceStatus({
          roots,
          collected,
          candidateCount: candidates.length,
          discovery: context.browser,
        })
      : undefined;
  return {
    candidates,
    source: buildPreviewSource({
      category,
      rules: context.rules,
      roots,
      collected,
      candidates,
      ...(status === undefined ? {} : { status }),
    }),
  };
}

function toDraft(candidate: DraftSource): CleanupCandidateDraft {
  return {
    path: candidate.path,
    sizeBytes: candidate.sizeBytes,
    category: candidate.category,
    ...(candidate.mtimeMs === undefined ? {} : { mtimeMs: candidate.mtimeMs }),
    ...(candidate.browser === undefined
      ? {}
      : { browser: candidate.browser, profile: candidate.profile, cacheKind: candidate.cacheKind }),
  };
}
