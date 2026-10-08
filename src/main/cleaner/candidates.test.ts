import { describe, expect, it } from 'vitest';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { buildCleanupCandidates, isDeletionAllowed } from './candidates';
import { CLEANER_RULES } from './rules';
import { windowsDir } from './systemRoots';

describe('cleanup candidates', () => {
  it('keeps only allow-covered unprotected entries', () => {
    const root = CLEANER_RULES.find((rule) => rule.category === 'user-temp')!.allowRoot;
    const built = buildCleanupCandidates([
      { path: `${root}\\a.tmp`, sizeBytes: 10 },
      { path: 'C:\\Users\\alice\\Documents\\report.docx', sizeBytes: 20 },
      { path: `${windowsDir()}\\System32\\drivers\\etc\\hosts`, sizeBytes: 30 },
      { path: `${root}\\link.tmp`, sizeBytes: 40, isSymlink: true },
    ]);
    expect(built.candidates.map((entry) => entry.path)).toEqual([`${root}\\a.tmp`]);
    expect(built.candidates[0].protected).toBe(false);
    expect(built.skippedOutsideRules).toBe(1);
    expect(built.skippedProtected).toBe(1);
    expect(built.skippedSymlink).toBe(1);
  });

  it('marks inaccessible entries without aborting the build', () => {
    const root = CLEANER_RULES.find((rule) => rule.category === 'user-temp')!.allowRoot;
    const built = buildCleanupCandidates([
      { path: `${root}\\locked.tmp`, sizeBytes: 99, inaccessible: true },
      { path: `${root}\\ok.tmp`, sizeBytes: 1 },
    ]);
    expect(built.inaccessible).toBe(1);
    expect(built.candidates).toHaveLength(2);
  });

  it('blocks protected and outside-rules paths in the deletion guard', () => {
    const root = CLEANER_RULES.find((rule) => rule.category === 'user-temp')!.allowRoot;
    expect(isDeletionAllowed(`${root}\\a.tmp`)).toEqual({ allowed: true });
    expect(isDeletionAllowed(`${windowsDir()}\\System32\\x.dll`)).toEqual({
      allowed: false,
      code: IPC_ERROR_CODES.CLEAN_PROTECTED_PATH,
    });
    expect(isDeletionAllowed('C:\\Users\\alice\\photo.jpg')).toEqual({
      allowed: false,
      code: IPC_ERROR_CODES.CLEAN_OUTSIDE_RULES,
    });
    const recycleRoot = CLEANER_RULES.find((rule) => rule.category === 'recycle-bin')!.allowRoot;
    expect(isDeletionAllowed(recycleRoot)).toEqual({
      allowed: false,
      code: IPC_ERROR_CODES.CLEAN_OUTSIDE_RULES,
    });
  });
});
