import type { CleanupCategory } from '@shared/ipc/contracts';

/** Категории мусора Cleaner: узкий фиксированный набор (ADR 0017, issue #54). */
export const CLEANUP_CATEGORIES: readonly CleanupCategory[] = [
  'user-temp',
  'windows-temp',
  'recycle-bin',
  'thumbnail-cache',
  'browser-cache',
  'log-files',
];

export function isCleanupCategory(value: unknown): value is CleanupCategory {
  return typeof value === 'string' && (CLEANUP_CATEGORIES as readonly string[]).includes(value);
}
