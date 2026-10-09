import { describe, expect, it, vi } from 'vitest';
import type { CleanupPreviewCandidate } from '@shared/ipc/contracts';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { runCleanup, type CleanerDeleteFs } from './deleter';
import { cleanerRules, fileRuleFor } from './rules';
import type { RecycleShell } from './recycleShell';
import { windowsDir } from './systemRoots';

const userRoot = fileRuleFor('user-temp', cleanerRules())!.allowRoot;
const PREVIEW_MTIME = 1_700_000_000_000;

function candidate(path: string, sizeBytes = 1): CleanupPreviewCandidate {
  return { id: 'c1', path, sizeBytes, category: 'user-temp', mtimeMs: PREVIEW_MTIME };
}

type FileSpec = { size?: number; mtimeMs?: number; symlink?: boolean };

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
          size: spec.size ?? 1,
          mtimeMs: spec.mtimeMs ?? PREVIEW_MTIME,
          isFile: () => !spec.symlink,
          isSymbolicLink: () => spec.symlink === true,
        };
      },
      unlink: async (path) => {
        const error = unlinkErrors[path];
        if (error) {
          throw Object.assign(new Error(error), { code: error });
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
    const items = await runCleanup([candidate(path, 7)], {
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

  it('skips an entry whose size or mtime changed after the preview', async () => {
    const resizedPath = `${userRoot}\\resized.tmp`;
    const touchedPath = `${userRoot}\\touched.tmp`;
    const untouchedPath = `${userRoot}\\kept.tmp`;
    const { fs, unlinked } = deleteFsStub({
      [resizedPath]: { size: 999 },
      [touchedPath]: { mtimeMs: PREVIEW_MTIME + 5_000 },
      [untouchedPath]: { size: 1 },
    });
    const items = await runCleanup(
      [candidate(resizedPath), candidate(touchedPath), candidate(untouchedPath)],
      { fs, isCancelled: () => false }
    );
    expect(items.map((item) => item.outcome)).toEqual(['skipped', 'skipped', 'deleted']);
    expect(unlinked).toEqual([untouchedPath]);
  });

  it('keeps an unlink failure as a per-item failure without aborting the run', async () => {
    const lockedPath = `${userRoot}\\locked.tmp`;
    const freePath = `${userRoot}\\free.tmp`;
    const { fs, unlinked } = deleteFsStub(
      { [lockedPath]: { size: 3 }, [freePath]: { size: 4 } },
      { [lockedPath]: 'EPERM' }
    );
    const items = await runCleanup([candidate(lockedPath, 3), candidate(freePath, 4)], {
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
    await runCleanup([candidate(path, 5)], { fs, isCancelled: () => false, onItem });
    expect(onItem).toHaveBeenCalledWith({ path, outcome: 'deleted', bytesFreed: 5 }, 1, 5);
  });

  it('skips a busy file as in-use without aborting the rest of the run', async () => {
    const thumbRoot = fileRuleFor('thumbnail-cache', cleanerRules())!.allowRoot;
    const busyPath = `${thumbRoot}\\thumbcache_96.db`;
    const freePath = `${thumbRoot}\\thumbcache_256.db`;
    const { fs, unlinked } = deleteFsStub(
      { [busyPath]: { size: 3 }, [freePath]: { size: 4 } },
      { [busyPath]: 'EBUSY' }
    );
    const items = await runCleanup([candidate(busyPath, 3), candidate(freePath, 4)], {
      fs,
      isCancelled: () => false,
    });
    expect(items[0]).toEqual({
      path: busyPath,
      outcome: 'skipped',
      bytesFreed: 0,
      code: IPC_ERROR_CODES.CLEAN_FILE_IN_USE,
    });
    expect(items[1]).toEqual({ path: freePath, outcome: 'deleted', bytesFreed: 4 });
    expect(unlinked).toEqual([freePath]);
  });

  it('clears a recycle candidate through the shell without touching the fs', async () => {
    const recyclePath = 'C:\\$Recycle.Bin';
    const { fs, unlinked, lstatCalls } = deleteFsStub({});
    const queried: string[] = [];
    const cleared: string[] = [];
    let emptied = false;
    const recycleShell: RecycleShell = {
      listVolumes: async () => ['C:\\'],
      query: async (root) => {
        queried.push(root);
        return emptied
          ? { ok: true, sizeBytes: 0, itemCount: 0 }
          : { ok: true, sizeBytes: 120, itemCount: 2 };
      },
      clear: async (root) => {
        cleared.push(root);
        emptied = true;
      },
    };
    const items = await runCleanup(
      [{ id: 'c1', path: recyclePath, sizeBytes: 120, category: 'recycle-bin' }],
      { fs, isCancelled: () => false, recycleShell }
    );
    expect(items).toEqual([{ path: recyclePath, outcome: 'deleted', bytesFreed: 120 }]);
    expect(cleared).toEqual(['C:\\']);
    expect(queried).toEqual(['C:\\', 'C:\\']);
    expect(lstatCalls).toEqual([]);
    expect(unlinked).toEqual([]);
  });

  it('fails a recycle candidate when the shell cannot measure the volume', async () => {
    const recyclePath = 'D:\\$Recycle.Bin';
    const { fs, unlinked } = deleteFsStub({});
    const recycleShell: RecycleShell = {
      listVolumes: async () => ['D:\\'],
      query: async () => ({ ok: false, reason: 'Shell недоступен' }),
      clear: async () => {
        throw new Error('очистка не должна вызываться');
      },
    };
    const items = await runCleanup(
      [{ id: 'c1', path: recyclePath, sizeBytes: 10, category: 'recycle-bin' }],
      { fs, isCancelled: () => false, recycleShell }
    );
    expect(items[0]).toMatchObject({ outcome: 'failed', bytesFreed: 0 });
    if (items[0].outcome === 'failed') {
      expect(items[0].error.code).toBe(IPC_ERROR_CODES.CLEAN_SHELL_UNAVAILABLE);
    }
    expect(unlinked).toEqual([]);
  });
});
