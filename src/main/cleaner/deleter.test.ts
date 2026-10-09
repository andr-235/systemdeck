import { describe, expect, it, vi } from 'vitest';
import type { CleanupPreviewCandidate } from '@shared/ipc/contracts';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { runCleanup, type CleanerDeleteFs } from './deleter';
import { CLEANER_RULES } from './rules';
import { windowsDir } from './systemRoots';

const userRoot = CLEANER_RULES.find((rule) => rule.category === 'user-temp')!.allowRoot;

function candidate(path: string): CleanupPreviewCandidate {
  return { id: 'c1', path, sizeBytes: 1, category: 'user-temp' };
}

type FileSpec = { size?: number; symlink?: boolean };

function deleteFsStub(
  files: Record<string, FileSpec>,
  unlinkErrors: Record<string, string> = {}
): { fs: CleanerDeleteFs; unlinked: string[]; lstatCalls: string[] } {
  const unlinked: string[] = [];
  const lstatCalls: string[] = [];
  return {
    unlinked,
    lstatCalls,
    fs: {
      lstat: async (path) => {
        lstatCalls.push(path);
        const spec = files[path];
        if (!spec) {
          throw new Error('ENOENT');
        }
        return {
          size: spec.size ?? 0,
          isFile: () => !spec.symlink,
          isSymbolicLink: () => spec.symlink === true,
        };
      },
      unlink: async (path) => {
        const error = unlinkErrors[path];
        if (error) {
          throw new Error(error);
        }
        unlinked.push(path);
      },
    },
  };
}

describe('cleanup deleter', () => {
  it('deletes a valid candidate and reports the actual freed bytes', async () => {
    const path = `${userRoot}\\a.tmp`;
    const { fs, unlinked } = deleteFsStub({ [path]: { size: 7 } });
    const processed: number[] = [];
    const items = await runCleanup([candidate(path)], {
      fs,
      isCancelled: () => false,
      onItem: (_item, count) => processed.push(count),
    });
    expect(items).toEqual([{ path, outcome: 'deleted', bytesFreed: 7 }]);
    expect(unlinked).toEqual([path]);
    expect(processed).toEqual([1]);
  });

  it('skips protected and outside-rules paths without touching the fs', async () => {
    const protectedPath = `${windowsDir()}\\System32\\drivers\\etc\\hosts`;
    const outsidePath = 'C:\\Users\\alice\\photo.jpg';
    const { fs, unlinked, lstatCalls } = deleteFsStub({});
    const items = await runCleanup([candidate(protectedPath), candidate(outsidePath)], {
      fs,
      isCancelled: () => false,
    });
    expect(items).toEqual([
      {
        path: protectedPath,
        outcome: 'skipped',
        bytesFreed: 0,
        code: IPC_ERROR_CODES.CLEAN_PROTECTED_PATH,
      },
      {
        path: outsidePath,
        outcome: 'skipped',
        bytesFreed: 0,
        code: IPC_ERROR_CODES.CLEAN_OUTSIDE_RULES,
      },
    ]);
    expect(lstatCalls).toEqual([]);
    expect(unlinked).toEqual([]);
  });

  it('skips entries that vanished or became links after the preview', async () => {
    const missingPath = `${userRoot}\\gone.tmp`;
    const linkPath = `${userRoot}\\link.tmp`;
    const { fs, unlinked } = deleteFsStub({ [linkPath]: { symlink: true } });
    const items = await runCleanup([candidate(missingPath), candidate(linkPath)], {
      fs,
      isCancelled: () => false,
    });
    expect(items.every((item) => item.outcome === 'skipped')).toBe(true);
    expect(
      items.every(
        (item) => item.outcome === 'skipped' && item.code === IPC_ERROR_CODES.CLEAN_ENTRY_INVALID
      )
    ).toBe(true);
    expect(unlinked).toEqual([]);
  });

  it('keeps an unlink failure as a per-item failure without aborting the run', async () => {
    const lockedPath = `${userRoot}\\locked.tmp`;
    const freePath = `${userRoot}\\free.tmp`;
    const { fs, unlinked } = deleteFsStub(
      { [lockedPath]: { size: 3 }, [freePath]: { size: 4 } },
      { [lockedPath]: 'EPERM' }
    );
    const items = await runCleanup([candidate(lockedPath), candidate(freePath)], {
      fs,
      isCancelled: () => false,
    });
    expect(items[0]).toMatchObject({ path: lockedPath, outcome: 'failed' });
    if (items[0].outcome === 'failed') {
      expect(items[0].error.code).toBe(IPC_ERROR_CODES.CLEAN_DELETE_FAILED);
      expect(items[0].error).not.toHaveProperty('stack');
    }
    expect(items[1]).toEqual({ path: freePath, outcome: 'deleted', bytesFreed: 4 });
    expect(unlinked).toEqual([freePath]);
  });

  it('stops processing when cancellation is requested', async () => {
    const firstPath = `${userRoot}\\a.tmp`;
    const secondPath = `${userRoot}\\b.tmp`;
    const { fs, unlinked } = deleteFsStub({ [firstPath]: { size: 1 }, [secondPath]: { size: 2 } });
    const seen: boolean[] = [];
    const items = await runCleanup([candidate(firstPath), candidate(secondPath)], {
      fs,
      isCancelled: () => {
        seen.push(true);
        return seen.length > 1;
      },
    });
    expect(items).toHaveLength(1);
    expect(unlinked).toEqual([firstPath]);
  });

  it('emits progress through onItem for every processed entry', async () => {
    const path = `${userRoot}\\a.tmp`;
    const { fs } = deleteFsStub({ [path]: { size: 5 } });
    const onItem = vi.fn();
    await runCleanup([candidate(path)], { fs, isCancelled: () => false, onItem });
    expect(onItem).toHaveBeenCalledWith({ path, outcome: 'deleted', bytesFreed: 5 }, 1, 5);
  });
});
