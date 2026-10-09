import { describe, expect, it } from 'vitest';
import { buildCleanupPreview } from './preview';
import { CLEANER_RULES } from './rules';
import { localAppData } from './systemRoots';
import type { CleanerDirEntry, CleanerFs } from './walker';

function entry(name: string, kind: 'file' | 'dir'): CleanerDirEntry {
  return {
    name,
    isDirectory: () => kind === 'dir',
    isFile: () => kind === 'file',
    isSymbolicLink: () => false,
  };
}

function ruleRoot(category: string): string {
  return CLEANER_RULES.find((rule) => rule.category === category)!.allowRoot;
}

/** Фейковая ФС: tree — каталоги, sizes — размеры файлов, locked — недоступные каталоги. */
function fakeFs(
  tree: Record<string, [string, 'file' | 'dir'][]>,
  sizes: Record<string, number>,
  locked: string[] = []
): CleanerFs {
  return {
    readdir: async (path) => {
      if (locked.includes(path)) {
        throw new Error('EACCES');
      }
      const children = tree[path];
      if (!children) {
        throw new Error(`NO_SUCH_DIR ${path}`);
      }
      return children.map(([name, kind]) => entry(name, kind));
    },
    stat: async (path) => ({ size: sizes[path] ?? 0, isFile: () => true }),
  };
}

describe('cleanup preview', () => {
  it('builds candidates and source statuses for the requested categories only', async () => {
    const userRoot = ruleRoot('user-temp');
    const recycleRoot = ruleRoot('recycle-bin');
    const fs = fakeFs(
      {
        [userRoot]: [
          ['a.tmp', 'file'],
          ['sub', 'dir'],
          ['skip.dat', 'file'],
        ],
        [`${userRoot}\\sub`]: [['b.tmp', 'file']],
        [recycleRoot]: [],
      },
      {
        [`${userRoot}\\a.tmp`]: 10,
        [`${userRoot}\\skip.dat`]: 5,
        [`${userRoot}\\sub\\b.tmp`]: 20,
      }
    );
    const preview = await buildCleanupPreview(['user-temp', 'recycle-bin'], fs);
    expect(preview.candidates.map((c) => c.path).sort()).toEqual([
      `${userRoot}\\a.tmp`,
      `${userRoot}\\sub\\b.tmp`,
    ]);
    expect(preview.candidates.every((c) => c.category === 'user-temp')).toBe(true);
    expect(preview.sources).toEqual([
      {
        category: 'user-temp',
        status: 'ok',
        candidateCount: 2,
        estimatedBytes: 30,
        inaccessibleDirectories: 0,
      },
      {
        category: 'recycle-bin',
        status: 'empty',
        candidateCount: 0,
        estimatedBytes: 0,
        inaccessibleDirectories: 0,
      },
    ]);
  });

  it('does not attribute candidates of a foreign category to the walked source', async () => {
    const browserRoot = localAppData();
    const fs = fakeFs(
      {
        [browserRoot]: [
          ['Temp', 'dir'],
          ['Chrome', 'dir'],
        ],
        [`${browserRoot}\\Temp`]: [['x.tmp', 'file']],
        [`${browserRoot}\\Chrome`]: [['Cache', 'dir']],
        [`${browserRoot}\\Chrome\\Cache`]: [['data', 'file']],
      },
      {
        [`${browserRoot}\\Temp\\x.tmp`]: 100,
        [`${browserRoot}\\Chrome\\Cache\\data`]: 50,
      }
    );
    const preview = await buildCleanupPreview(['browser-cache'], fs);
    // x.tmp классифицируется как user-temp и в источник browser-cache не входит.
    expect(preview.candidates).toEqual([
      { path: `${browserRoot}\\Chrome\\Cache\\data`, sizeBytes: 50, category: 'browser-cache' },
    ]);
    expect(preview.sources[0]).toMatchObject({ candidateCount: 1, estimatedBytes: 50 });
  });

  it('marks a source partial when directories are inaccessible', async () => {
    const userRoot = ruleRoot('user-temp');
    const lockedDir = `${userRoot}\\locked`;
    const fs = fakeFs({ [userRoot]: [['locked', 'dir']], [lockedDir]: [] }, {}, [lockedDir]);
    const preview = await buildCleanupPreview(['user-temp'], fs);
    expect(preview.candidates).toHaveLength(0);
    expect(preview.sources[0]).toMatchObject({
      status: 'partial',
      candidateCount: 0,
      inaccessibleDirectories: 1,
    });
  });

  it('returns nothing for an empty category list', async () => {
    expect(await buildCleanupPreview([], fakeFs({}, {}))).toEqual({
      candidates: [],
      sources: [],
    });
  });
});
