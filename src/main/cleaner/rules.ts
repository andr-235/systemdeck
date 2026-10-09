import type { CleanupCategory } from '@shared/ipc/contracts';
import { dedupeRoots, isPathStrictlyUnderRoot, normalizeCleanerPath } from './paths';
import { localAppDataDir, systemRootDir, type Env } from './systemRoots';
import { userTempRoots, windowsTempRoot } from './tempRoots';

/** Порог возраста TEMP-категорий: молодые и активные файлы кандидатами не являются. */
export const TEMP_MIN_AGE_HOURS = 24;

/** Паттерн TEMP-правил сохранён из #54: расширения, а не любое имя файла (CON-004). */
const TEMP_PATTERN = /\.(tmp|temp|log|bak)$|^~/i;

/** Allow-правило: узкий корень + паттерн имени. Оба поля обязательны (REQ-003). */
export type CleanupRule = {
  category: CleanupCategory;
  allowRoot: string;
  pattern: RegExp;
  /** Минимальный возраст файла в часах; не задан — возраст не проверяется (issue #56). */
  minAgeHours?: number;
};

function tempRules(category: CleanupCategory, roots: readonly string[]): CleanupRule[] {
  return roots.map((allowRoot) => ({
    category,
    allowRoot,
    pattern: TEMP_PATTERN,
    minAgeHours: TEMP_MIN_AGE_HOURS,
  }));
}

function singleRule(
  category: CleanupCategory,
  allowRoot: string | null,
  pattern: RegExp
): CleanupRule[] {
  return allowRoot === null ? [] : [{ category, allowRoot, pattern }];
}

/** Реестр правил из снимка окружения: сломанная переменная не даёт allow-корня (issue #56). */
export function cleanerRules(env: Env = process.env): CleanupRule[] {
  const local = localAppDataDir(env);
  const win = systemRootDir(env);
  const winTemp = windowsTempRoot(env);
  return [
    ...tempRules('user-temp', userTempRoots(env)),
    ...tempRules('windows-temp', winTemp === null ? [] : [winTemp]),
    ...singleRule('recycle-bin', 'C:\\$Recycle.Bin', /./),
    ...singleRule(
      'thumbnail-cache',
      local === null ? null : `${local}\\Microsoft\\Windows\\Explorer`,
      /\\thumbcache_[^\\]*\.db$/i
    ),
    ...singleRule('browser-cache', local, /\\(Cache|Code Cache|GPUCache)\\/i),
    ...singleRule('log-files', win === null ? null : `${win}\\Logs`, /\.(log|etl)$/i),
  ];
}

export function matchesCleanupRule(path: string, rule: CleanupRule): boolean {
  if (!isPathStrictlyUnderRoot(path, rule.allowRoot)) {
    return false;
  }
  return rule.pattern.test(normalizeCleanerPath(path));
}

export function findCleanupRule(
  path: string,
  rules: readonly CleanupRule[] = cleanerRules()
): CleanupRule | undefined {
  return rules.find((rule) => matchesCleanupRule(path, rule));
}

/** Allow-корни одной категории без дублей и вложенности; Renderer корни не передаёт. */
export function rootsForCategory(
  category: CleanupCategory,
  rules: readonly CleanupRule[] = cleanerRules()
): string[] {
  return dedupeRoots(rules.filter((rule) => rule.category === category).map((r) => r.allowRoot));
}

/** Порог возраста для категории: правило категории может не задавать его. */
export function minAgeHoursFor(
  category: CleanupCategory,
  rules: readonly CleanupRule[]
): number | undefined {
  return rules.find((rule) => rule.category === category)?.minAgeHours;
}
