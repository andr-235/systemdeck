import { describe, expect, it } from 'vitest';
import { buildCleanupPreview } from './preview';
import { cleanerRules, TEMP_MIN_AGE_HOURS } from './rules';
import type { CleanupRule } from './rules';
import type { CleanerDirEntry, CleanerFs } from './walker';

const OLD_MTIME = Date.now() - 48 * 3_600_000;
const YOUNG_MTIME = Date.now() - 60_000;

function entry(name: string, kind: 'file' | 'dir'): CleanerDirEntry {
  return {
    name,
    isDirectory: () => kind === 'dir',
    isFile: () => kind === 'file',
    isSymbolicLink: () => false,
  };
}

function ruleRoot(category: string): string {
  const rule = cleanerRules().find((candidate) => candidate.category === category);
  expect(rule, category).toBeDefined();
  return rule!.allowRoot;
}

/** Фейковая ФС: tree — каталоги, sizes — размеры файлов, locked — недоступные каталоги. */
function fakeFs(
  tree: Record<string, [string, 'file' | 'dir'][]>,
  sizes: Record<string, number>,
  locked: string[] = [],
  mtimes: Record<string, number> = {}
): CleanerFs {
  return {
    readdir: async (path) => {
      if (locked.includes(path)) {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      }
      const children = tree[path];
      if (!children) {
        throw new Error(`NO_SUCH_DIR ${path}`);
      }
      return children.map(([name, kind]) => entry(name, kind));
    },
    stat: async (path) => ({
      size: sizes[path] ?? 0,
      mtimeMs: mtimes[path] ?? OLD_MTIME,
      isFile: () => true,
    }),
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
    expect(preview.candidates.every((c) => c.mtimeMs === OLD_MTIME)).toBe(true);
    expect(preview.sources).toEqual([
      {
        category: 'user-temp',
        status: 'ok',
        minAgeHours: TEMP_MIN_AGE_HOURS,
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
    const browserRoot = ruleRoot('browser-cache');
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
      {
        path: `${browserRoot}\\Chrome\\Cache\\data`,
        sizeBytes: 50,
        category: 'browser-cache',
        mtimeMs: OLD_MTIME,
      },
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

  it('marks the source unavailable with the admin-rights reason when the root is unreadable', async () => {
    const userRoot = ruleRoot('user-temp');
    const preview = await buildCleanupPreview(['user-temp'], fakeFs({}, {}, [userRoot]));
    expect(preview.sources[0]).toMatchObject({
      category: 'user-temp',
      status: 'unavailable',
      candidateCount: 0,
    });
    expect(preview.sources[0].reason).toContain('права администратора');
  });

  it('marks the source unavailable with the reason when no roots are configured', async () => {
    const preview = await buildCleanupPreview(['windows-temp'], fakeFs({}, {}), { rules: [] });
    expect(preview.sources[0]).toMatchObject({ status: 'unavailable', candidateCount: 0 });
    expect(preview.sources[0].reason).toContain('%WINDIR%');
  });

  it('reports an available source without matching files as empty, not unavailable', async () => {
    const userRoot = ruleRoot('user-temp');
    const fs = fakeFs({ [userRoot]: [['young.tmp', 'file']] }, { [`${userRoot}\\young.tmp`]: 7 });
    const preview = await buildCleanupPreview(['user-temp'], fs, {
      now: Date.now(),
      rules: cleanerRules().map((rule) => ({ ...rule, minAgeHours: 10_000 })),
    });
    expect(preview.candidates).toHaveLength(0);
    expect(preview.sources[0]).toMatchObject({
      status: 'empty',
      candidateCount: 0,
      inaccessibleDirectories: 0,
    });
    expect(preview.sources[0].reason).toBeUndefined();
  });

  it('deduplicates overlapping allow roots so a file is never reported twice', async () => {
    const rules: CleanupRule[] = [
      { category: 'user-temp', allowRoot: 'C:\\Sandbox\\Temp', pattern: /./ },
      { category: 'user-temp', allowRoot: 'C:\\Sandbox\\Temp\\nested', pattern: /./ },
      { category: 'user-temp', allowRoot: 'c:/sandbox/temp', pattern: /./ },
    ];
    const fs = fakeFs(
      {
        'C:\\Sandbox\\Temp': [
          ['old.tmp', 'file'],
          ['nested', 'dir'],
        ],
        'C:\\Sandbox\\Temp\\nested': [['inner.tmp', 'file']],
      },
      {
        'C:\\Sandbox\\Temp\\old.tmp': 11,
        'C:\\Sandbox\\Temp\\nested\\inner.tmp': 22,
      }
    );
    const preview = await buildCleanupPreview(['user-temp'], fs, { rules });
    expect(preview.candidates.map((c) => c.path).sort()).toEqual([
      'C:\\Sandbox\\Temp\\nested\\inner.tmp',
      'C:\\Sandbox\\Temp\\old.tmp',
    ]);
    expect(preview.sources[0]).toMatchObject({ status: 'ok', candidateCount: 2 });
  });

  it('keeps a young file out of the candidates while the source stays available', async () => {
    const userRoot = ruleRoot('user-temp');
    const fs = fakeFs(
      {
        [userRoot]: [
          ['young.tmp', 'file'],
          ['old.tmp', 'file'],
        ],
      },
      { [`${userRoot}\\young.tmp`]: 1, [`${userRoot}\\old.tmp`]: 2 },
      [],
      { [`${userRoot}\\young.tmp`]: YOUNG_MTIME, [`${userRoot}\\old.tmp`]: OLD_MTIME }
    );
    const preview = await buildCleanupPreview(['user-temp'], fs);
    expect(preview.candidates.map((c) => c.path)).toEqual([`${userRoot}\\old.tmp`]);
    expect(preview.sources[0]).toMatchObject({
      status: 'ok',
      candidateCount: 1,
      minAgeHours: TEMP_MIN_AGE_HOURS,
    });
  });

  it('returns nothing for an empty category list', async () => {
    expect(await buildCleanupPreview([], fakeFs({}, {}))).toEqual({
      candidates: [],
      sources: [],
    });
  });
});
