import { describe, expect, it } from 'vitest';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { buildCleanupCandidates, isDeletionAllowed } from './candidates';
import { cleanerRules } from './rules';
import { windowsDir } from './systemRoots';

const OLD_MTIME = Date.now() - 48 * 3_600_000;
const YOUNG_MTIME = Date.now() - 60_000;

function rootOf(category: string): string {
  const rule = cleanerRules().find((candidate) => candidate.category === category);
  expect(rule, category).toBeDefined();
  return rule!.allowRoot;
}

describe('cleanup candidates', () => {
  it('keeps only allow-covered unprotected entries', () => {
    const root = rootOf('user-temp');
    const built = buildCleanupCandidates([
      { path: `${root}\\a.tmp`, sizeBytes: 10, mtimeMs: OLD_MTIME },
      { path: 'C:\\Users\\alice\\Documents\\report.docx', sizeBytes: 20, mtimeMs: OLD_MTIME },
      { path: `${windowsDir()}\\System32\\drivers\\etc\\hosts`, sizeBytes: 30, mtimeMs: OLD_MTIME },
      { path: `${root}\\link.tmp`, sizeBytes: 40, mtimeMs: OLD_MTIME, isSymlink: true },
    ]);
    expect(built.candidates.map((entry) => entry.path)).toEqual([`${root}\\a.tmp`]);
    expect(built.candidates[0].protected).toBe(false);
    expect(built.candidates[0].mtimeMs).toBe(OLD_MTIME);
    expect(built.skippedOutsideRules).toBe(1);
    expect(built.skippedProtected).toBe(1);
    expect(built.skippedSymlink).toBe(1);
  });

  it('marks inaccessible entries without aborting the build', () => {
    const root = rootOf('user-temp');
    const built = buildCleanupCandidates([
      { path: `${root}\\locked.tmp`, sizeBytes: 99, mtimeMs: OLD_MTIME, inaccessible: true },
      { path: `${root}\\ok.tmp`, sizeBytes: 1, mtimeMs: OLD_MTIME },
    ]);
    expect(built.inaccessible).toBe(1);
    expect(built.candidates).toHaveLength(2);
  });

  it('never turns a young or age-unknown file into a candidate', () => {
    const root = rootOf('user-temp');
    const built = buildCleanupCandidates([
      { path: `${root}\\young.tmp`, sizeBytes: 1, mtimeMs: YOUNG_MTIME },
      { path: `${root}\\unknown.tmp`, sizeBytes: 1 },
      { path: `${root}\\old.tmp`, sizeBytes: 1, mtimeMs: OLD_MTIME },
    ]);
    expect(built.candidates.map((entry) => entry.path)).toEqual([`${root}\\old.tmp`]);
    expect(built.skippedTooYoung).toBe(2);
  });

  it('keeps the age threshold configurable through the injected rules', () => {
    const root = rootOf('user-temp');
    const withoutThreshold = cleanerRules().map((rule) => ({
      ...rule,
      minAgeHours: undefined,
    }));
    const built = buildCleanupCandidates(
      [{ path: `${root}\\young.tmp`, sizeBytes: 1, mtimeMs: YOUNG_MTIME }],
      { rules: withoutThreshold }
    );
    expect(built.candidates).toHaveLength(1);
  });

  it('blocks protected and outside-rules paths in the deletion guard', () => {
    const root = rootOf('user-temp');
    expect(isDeletionAllowed(`${root}\\a.tmp`)).toEqual({ allowed: true });
    expect(isDeletionAllowed(`${windowsDir()}\\System32\\x.dll`)).toEqual({
      allowed: false,
      code: IPC_ERROR_CODES.CLEAN_PROTECTED_PATH,
    });
    expect(isDeletionAllowed('C:\\Users\\alice\\photo.jpg')).toEqual({
      allowed: false,
      code: IPC_ERROR_CODES.CLEAN_OUTSIDE_RULES,
    });
    const recycleRoot = rootOf('recycle-bin');
    expect(isDeletionAllowed(recycleRoot)).toEqual({
      allowed: false,
      code: IPC_ERROR_CODES.CLEAN_OUTSIDE_RULES,
    });
  });
});
