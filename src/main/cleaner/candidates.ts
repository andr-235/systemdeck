import type { CleanupCandidate } from '@shared/ipc/contracts';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { isProtectedPath } from './protectedPaths';
import {
  cleanerRules,
  findCleanupRule,
  findFileRule,
  type CleanupFileRule,
  type CleanupRule,
} from './rules';

/** Сырая запись на вход движка (от walker или будущего enumerator корзины). */
export type RawCleanupEntry = {
  path: string;
  sizeBytes: number;
  mtimeMs?: number;
  isSymlink?: boolean;
  inaccessible?: boolean;
};

export type CandidateBuildResult = {
  candidates: CleanupCandidate[];
  skippedOutsideRules: number;
  skippedProtected: number;
  skippedSymlink: number;
  /** Моложе порога правила либо возраст неизвестен: кандидатом не становится. */
  skippedTooYoung: number;
  inaccessible: number;
};

export type CandidateBuildOptions = {
  now?: number;
  rules?: readonly CleanupRule[];
};

const HOUR_MS = 3_600_000;

/** Возрастная проверка по конфигурации файла: неизвестный возраст — не старый файл. */
function isOldEnough(entry: RawCleanupEntry, rule: CleanupFileRule, now: number): boolean {
  if (rule.minAgeHours === undefined) {
    return true;
  }
  if (typeof entry.mtimeMs !== 'number') {
    return false;
  }
  return now - entry.mtimeMs >= rule.minAgeHours * HOUR_MS;
}

/** Кандидатом становится только покрытое allow-правилом и незащищённое. */
export function buildCleanupCandidates(
  entries: RawCleanupEntry[],
  options: CandidateBuildOptions = {}
): CandidateBuildResult {
  const rules = options.rules ?? cleanerRules();
  const now = options.now ?? Date.now();
  const result: CandidateBuildResult = {
    candidates: [],
    skippedOutsideRules: 0,
    skippedProtected: 0,
    skippedSymlink: 0,
    skippedTooYoung: 0,
    inaccessible: 0,
  };
  for (const entry of entries) {
    if (entry.isSymlink) {
      result.skippedSymlink++;
      continue;
    }
    if (entry.inaccessible) {
      result.inaccessible++;
    }
    if (isProtectedPath(entry.path)) {
      result.skippedProtected++;
      continue;
    }
    // Агрегат корзины из файлового обхода не строится: его даёт только Shell-энумератор.
    const rule = findFileRule(entry.path, rules);
    if (!rule) {
      result.skippedOutsideRules++;
      continue;
    }
    if (!isOldEnough(entry, rule, now)) {
      result.skippedTooYoung++;
      continue;
    }
    result.candidates.push({
      path: entry.path,
      sizeBytes: entry.inaccessible ? 0 : entry.sizeBytes,
      category: rule.category,
      protected: false,
      ...(typeof entry.mtimeMs === 'number' ? { mtimeMs: entry.mtimeMs } : {}),
    });
  }
  return result;
}

export type DeletionVerdict = { allowed: true } | { allowed: false; code: string };

/** Guard удаления: защищённое и вне правил блокируется до операции. */
export function isDeletionAllowed(
  path: string,
  rules: readonly CleanupRule[] = cleanerRules()
): DeletionVerdict {
  if (isProtectedPath(path)) {
    return { allowed: false, code: IPC_ERROR_CODES.CLEAN_PROTECTED_PATH };
  }
  if (!findCleanupRule(path, rules)) {
    return { allowed: false, code: IPC_ERROR_CODES.CLEAN_OUTSIDE_RULES };
  }
  return { allowed: true };
}
