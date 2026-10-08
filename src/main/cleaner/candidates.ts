import type { CleanupCandidate } from '@shared/ipc/contracts';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { isProtectedPath } from './protectedPaths';
import { findCleanupRule } from './rules';

/** Сырая запись на вход движка (от walker или будущего enumerator корзины). */
export type RawCleanupEntry = {
  path: string;
  sizeBytes: number;
  isSymlink?: boolean;
  inaccessible?: boolean;
};

export type CandidateBuildResult = {
  candidates: CleanupCandidate[];
  skippedOutsideRules: number;
  skippedProtected: number;
  skippedSymlink: number;
  inaccessible: number;
};

/** Кандидатом становится только покрытое allow-правилом и незащищённое. */
export function buildCleanupCandidates(entries: RawCleanupEntry[]): CandidateBuildResult {
  const result: CandidateBuildResult = {
    candidates: [],
    skippedOutsideRules: 0,
    skippedProtected: 0,
    skippedSymlink: 0,
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
    const rule = findCleanupRule(entry.path);
    if (!rule) {
      result.skippedOutsideRules++;
      continue;
    }
    result.candidates.push({
      path: entry.path,
      sizeBytes: entry.inaccessible ? 0 : entry.sizeBytes,
      category: rule.category,
      protected: false,
    });
  }
  return result;
}

export type DeletionVerdict = { allowed: true } | { allowed: false; code: string };

/** Guard удаления: защищённое и вне правил блокируется до операции. */
export function isDeletionAllowed(path: string): DeletionVerdict {
  if (isProtectedPath(path)) {
    return { allowed: false, code: IPC_ERROR_CODES.CLEAN_PROTECTED_PATH };
  }
  if (!findCleanupRule(path)) {
    return { allowed: false, code: IPC_ERROR_CODES.CLEAN_OUTSIDE_RULES };
  }
  return { allowed: true };
}
