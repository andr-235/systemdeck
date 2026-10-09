import type { CleanupCategory } from '@shared/ipc/contracts';
import { getLogDirPath } from '../logger';
import { dedupeRoots, isPathStrictlyUnderRoot, normalizeCleanerPath } from './paths';
import { localAppDataDir, type Env } from './systemRoots';
import { userTempRoots, windowsTempRoot } from './tempRoots';

/** Порог возраста TEMP-категорий: молодые и активные файлы кандидатами не являются. */
export const TEMP_MIN_AGE_HOURS = 24;

/** Порог возраста ротированных логов SystemDeck: свежие ротации сохраняются для диагностики. */
export const LOG_MIN_AGE_HOURS = 24;

/** Паттерн TEMP-правил сохранён из #54: расширения, а не любое имя файла (CON-004). */
const TEMP_PATTERN = /\.(tmp|temp|log|bak)$|^~/i;

/** Ротированные логи `systemdeck.log.<N>`; активный `systemdeck.log` под паттерн не попадает. */
const ROTATED_LOG_PATTERN = /\\systemdeck\.log\.\d+$/i;

/** Allow-правило файлового источника: узкий корень + паттерн имени (REQ-003, issue #54). */
export type CleanupFileRule = {
  kind: 'file';
  category: CleanupCategory;
  allowRoot: string;
  pattern: RegExp;
  /** Минимальный возраст файла в часах; не задан — возраст не проверяется (issue #56). */
  minAgeHours?: number;
};

/**
 * Агрегированное правило корзины: кандидат — сам корень корзины явно выбранного тома,
 * очистка только Shell-механизмом (issue #57). Корень не обходится walker'ом.
 */
export type CleanupRecycleRule = { kind: 'recycle-volume'; category: 'recycle-bin' };

export type CleanupRule = CleanupFileRule | CleanupRecycleRule;

/** Путь — ровно корень корзины одного тома: файл внутри и префикс-двойник не проходят. */
export function isRecycleVolumePath(path: string): boolean {
  return /^[a-z]:\\\$recycle\.bin$/.test(normalizeCleanerPath(path));
}

function fileRule(
  category: CleanupCategory,
  allowRoot: string | null,
  pattern: RegExp,
  minAgeHours?: number
): CleanupFileRule[] {
  return allowRoot === null
    ? []
    : [
        {
          kind: 'file',
          category,
          allowRoot,
          pattern,
          ...(minAgeHours === undefined ? {} : { minAgeHours }),
        },
      ];
}

function tempRules(category: CleanupCategory, roots: readonly string[]): CleanupFileRule[] {
  return roots.flatMap((allowRoot) =>
    fileRule(category, allowRoot, TEMP_PATTERN, TEMP_MIN_AGE_HOURS)
  );
}

/** Реестр правил из снимка окружения: сломанная переменная не даёт allow-корня (issue #56). */
export function cleanerRules(
  env: Env = process.env,
  logDir: string | null = getLogDirPath()
): CleanupRule[] {
  const local = localAppDataDir(env);
  const winTemp = windowsTempRoot(env);
  return [
    ...tempRules('user-temp', userTempRoots(env)),
    ...tempRules('windows-temp', winTemp === null ? [] : [winTemp]),
    { kind: 'recycle-volume', category: 'recycle-bin' },
    ...fileRule(
      'thumbnail-cache',
      local === null ? null : `${local}\\Microsoft\\Windows\\Explorer`,
      /\\thumbcache_[^\\]*\.db$/i
    ),
    ...fileRule('browser-cache', local, /\\(Cache|Code Cache|GPUCache)\\/i),
    ...fileRule('log-files', logDir, ROTATED_LOG_PATTERN, LOG_MIN_AGE_HOURS),
  ];
}

export function matchesCleanupRule(path: string, rule: CleanupRule): boolean {
  if (rule.kind === 'recycle-volume') {
    return isRecycleVolumePath(path);
  }
  if (!isPathStrictlyUnderRoot(path, rule.allowRoot)) {
    return false;
  }
  return rule.pattern.test(normalizeCleanerPath(path));
}

/** Правило для пути любого типа: файловые корни и агрегат корзины (guard удаления). */
export function findCleanupRule(
  path: string,
  rules: readonly CleanupRule[] = cleanerRules()
): CleanupRule | undefined {
  return rules.find((rule) => matchesCleanupRule(path, rule));
}

/** Только файловое правило: сборка кандидатов из файлового обхода не видит агрегатов. */
export function findFileRule(
  path: string,
  rules: readonly CleanupRule[] = cleanerRules()
): CleanupFileRule | undefined {
  const rule = findCleanupRule(path, rules);
  return rule?.kind === 'file' ? rule : undefined;
}

/** Файловое allow-правило категории: источник корней обхода и паттерна имени. */
export function fileRuleFor(
  category: CleanupCategory,
  rules: readonly CleanupRule[] = cleanerRules()
): CleanupFileRule | undefined {
  return rules.find(
    (rule): rule is CleanupFileRule => rule.kind === 'file' && rule.category === category
  );
}

/** Allow-корни файловых категорий без дублей и вложенности; Renderer корни не передаёт. */
export function rootsForCategory(
  category: CleanupCategory,
  rules: readonly CleanupRule[] = cleanerRules()
): string[] {
  return dedupeRoots(
    rules
      .filter((rule): rule is CleanupFileRule => rule.kind === 'file' && rule.category === category)
      .map((rule) => rule.allowRoot)
  );
}

/** Порог возраста для категории: правило корзины и правило без порога не дают значения. */
export function minAgeHoursFor(
  category: CleanupCategory,
  rules: readonly CleanupRule[]
): number | undefined {
  return fileRuleFor(category, rules)?.minAgeHours;
}
