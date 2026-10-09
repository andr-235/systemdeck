import {
  browserCacheRules,
  discoverBrowserCacheRoots,
  type BrowserDiscovery,
} from './browserRoots';
import { cleanerRules, type CleanupRule } from './rules';
import type { Env } from './systemRoots';
import type { CleanerFs } from './walker';

export type ResolvedCleanupRules = {
  /** Актуальные правила: статический реестр + обнаруженные каталоги кэшей браузеров. */
  rules: CleanupRule[];
  browser: BrowserDiscovery;
};

/**
 * Свежие правила для конкретного шага: обнаружение выполняется и в preview, и перед
 * удалением — Main перепроверяет правило по актуальному состоянию ФС (issue #58, REQ-007).
 */
export async function resolveCleanupRules(
  fs: CleanerFs,
  env: Env = process.env
): Promise<ResolvedCleanupRules> {
  const browser = await discoverBrowserCacheRoots(env, fs);
  return {
    rules: [...cleanerRules(env), ...browserCacheRules(browser)],
    browser,
  };
}
