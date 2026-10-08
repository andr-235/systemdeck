import type { CleanupCategory } from '@shared/ipc/contracts';
import { isPathStrictlyUnderRoot, normalizeCleanerPath } from './paths';
import { localAppData, windowsDir } from './systemRoots';

/** Allow-правило: узкий корень + паттерн имени. Оба поля обязательны (REQ-003). */
export type CleanupRule = {
  category: CleanupCategory;
  allowRoot: string;
  pattern: RegExp;
};

/** Каркас реестра; конкретные корни TEMP/корзины/браузеров — issues #56–#58.
 *  Корень browser-cache пока шире (весь LOCALAPPDATA) — сузить до профилей в #58. */
export const CLEANER_RULES: readonly CleanupRule[] = [
  {
    category: 'user-temp',
    allowRoot: `${localAppData()}\\Temp`,
    pattern: /\.(tmp|temp|log|bak)$|^~/i,
  },
  {
    category: 'windows-temp',
    allowRoot: `${windowsDir()}\\Temp`,
    pattern: /\.(tmp|temp|log|bak)$|^~/i,
  },
  { category: 'recycle-bin', allowRoot: 'C:\\$Recycle.Bin', pattern: /./ },
  {
    category: 'thumbnail-cache',
    allowRoot: `${localAppData()}\\Microsoft\\Windows\\Explorer`,
    pattern: /\\thumbcache_[^\\]*\.db$/i,
  },
  {
    category: 'browser-cache',
    allowRoot: localAppData(),
    pattern: /\\(Cache|Code Cache|GPUCache)\\/i,
  },
  { category: 'log-files', allowRoot: `${windowsDir()}\\Logs`, pattern: /\.(log|etl)$/i },
];

export function matchesCleanupRule(path: string, rule: CleanupRule): boolean {
  if (!isPathStrictlyUnderRoot(path, rule.allowRoot)) {
    return false;
  }
  return rule.pattern.test(normalizeCleanerPath(path));
}

export function findCleanupRule(path: string): CleanupRule | undefined {
  return CLEANER_RULES.find((rule) => matchesCleanupRule(path, rule));
}
