import { describe, expect, it } from 'vitest';
import type { CleanupCategory } from '@shared/ipc/contracts';
import { buildCleanupPreview } from './preview';
import { cleanerRules, fileRuleFor, TEMP_MIN_AGE_HOURS } from './rules';
import type { CleanupRule } from './rules';
import type { RecycleShell, RecycleVolumeState } from './recycleShell';
import type { CleanerDirEntry, CleanerFs } from './walker';

const OLD_MTIME = Date.now() - 48 * 3_600_000;
const YOUNG_MTIME = Date.now() - 60_000;

/** Мок-пути браузеров для обнаружения профилей (issue #58): реальная ФС не трогается. */
const BROWSER_ENV = {
  LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
  APPDATA: 'C:\\Users\\alice\\AppData\\Roaming',
};
const CHROME_BASE = `${BROWSER_ENV.LOCALAPPDATA}\\Google\\Chrome\\User Data`;
const EDGE_BASE = `${BROWSER_ENV.LOCALAPPDATA}\\Microsoft\\Edge\\User Data`;

function entry(name: string, kind: 'file' | 'dir'): CleanerDirEntry {
  return {
    name,
    isDirectory: () => kind === 'dir',
    isFile: () => kind === 'file',
    isSymbolicLink: () => false,
  };
}

function ruleRoot(category: CleanupCategory): string {
  const rule = fileRuleFor(category, cleanerRules());
  expect(rule, category).toBeDefined();
  return rule!.allowRoot;
}

/** Фейковый Shell корзины: tomState по корням томов, listError — отказ перечня томов. */
function fakeRecycleShell(
  volumeStates: Record<string, RecycleVolumeState>,
  volumes: string[] = Object.keys(volumeStates),
  listError?: string
): RecycleShell {
  return {
    listVolumes: async () => {
      if (listError !== undefined) {
        throw new Error(listError);
      }
      return volumes;
    },
    query: async (volumeRoot) =>
      volumeStates[volumeRoot] ?? { ok: false, reason: 'нет данных по тому' },
    clear: async () => undefined,
  };
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
        throw Object.assign(new Error(`NO_SUCH_DIR ${path}`), { code: 'ENOENT' });
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
    const fs = fakeFs(
      {
        [userRoot]: [
          ['a.tmp', 'file'],
          ['sub', 'dir'],
          ['skip.dat', 'file'],
        ],
        [`${userRoot}\\sub`]: [['b.tmp', 'file']],
      },
      {
        [`${userRoot}\\a.tmp`]: 10,
        [`${userRoot}\\skip.dat`]: 5,
        [`${userRoot}\\sub\\b.tmp`]: 20,
      }
    );
    const recycleShell = fakeRecycleShell({ 'C:\\': { ok: true, sizeBytes: 0, itemCount: 0 } });
    const preview = await buildCleanupPreview(['user-temp', 'recycle-bin'], fs, {
      recycleShell,
    });
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

  it('builds one aggregate recycle candidate per volume without walking the fs', async () => {
    const fs: CleanerFs = {
      readdir: async () => {
        throw new Error("корзина не должна обходаться walker'ом");
      },
      stat: async () => {
        throw new Error("корзина не должна обходаться walker'ом");
      },
    };
    const recycleShell = fakeRecycleShell({
      'C:\\': { ok: true, sizeBytes: 500, itemCount: 3 },
      'D:\\': { ok: true, sizeBytes: 0, itemCount: 0 },
    });
    const preview = await buildCleanupPreview(['recycle-bin'], fs, { recycleShell });
    expect(preview.candidates).toEqual([
      { path: 'C:\\$Recycle.Bin', sizeBytes: 500, category: 'recycle-bin' },
    ]);
    expect(preview.sources[0]).toMatchObject({
      category: 'recycle-bin',
      status: 'ok',
      candidateCount: 1,
      estimatedBytes: 500,
      inaccessibleDirectories: 0,
    });
    expect(preview.sources[0].minAgeHours).toBeUndefined();
  });

  it('marks the recycle source unavailable when the shell is missing', async () => {
    const fs = fakeFs({}, {});
    const preview = await buildCleanupPreview(['recycle-bin'], fs, {
      recycleShell: fakeRecycleShell({}, [], 'PowerShell недоступен'),
    });
    expect(preview.candidates).toHaveLength(0);
    expect(preview.sources[0]).toMatchObject({
      category: 'recycle-bin',
      status: 'unavailable',
      candidateCount: 0,
      estimatedBytes: 0,
    });
    expect(preview.sources[0].reason).toContain('Корзина недоступна');
    expect(preview.sources[0].reason).toContain('PowerShell недоступен');
  });

  it('keeps a volume with a failed measurement out of the candidates as partial', async () => {
    const recycleShell = fakeRecycleShell({
      'C:\\': { ok: true, sizeBytes: 700, itemCount: 2 },
      'D:\\': { ok: false, reason: 'Shell отклонил запрос корзины тома' },
    });
    const preview = await buildCleanupPreview(['recycle-bin'], fakeFs({}, {}), { recycleShell });
    expect(preview.candidates).toEqual([
      { path: 'C:\\$Recycle.Bin', sizeBytes: 700, category: 'recycle-bin' },
    ]);
    expect(preview.sources[0]).toMatchObject({ status: 'partial', candidateCount: 1 });
    expect(preview.sources[0].reason).toContain('D:');
  });

  it('builds browser-cache candidates from an exact cache root with profile metadata', async () => {
    const cacheRoot = 'C:\\Users\\alice\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache';
    const rules: CleanupRule[] = [
      {
        kind: 'file',
        category: 'browser-cache',
        allowRoot: cacheRoot,
        browser: 'chrome',
        profile: 'Default',
        cacheKind: 'Cache',
      },
    ];
    const fs = fakeFs(
      {
        [cacheRoot]: [
          ['data_0', 'file'],
          ['Cache_Data', 'dir'],
        ],
        [`${cacheRoot}\\Cache_Data`]: [['f_1', 'file']],
      },
      { [`${cacheRoot}\\data_0`]: 50, [`${cacheRoot}\\Cache_Data\\f_1`]: 20 }
    );
    const preview = await buildCleanupPreview(['browser-cache'], fs, { rules });
    expect(preview.candidates).toEqual([
      {
        path: `${cacheRoot}\\data_0`,
        sizeBytes: 50,
        category: 'browser-cache',
        mtimeMs: OLD_MTIME,
        browser: 'chrome',
        profile: 'Default',
        cacheKind: 'Cache',
      },
      {
        path: `${cacheRoot}\\Cache_Data\\f_1`,
        sizeBytes: 20,
        category: 'browser-cache',
        mtimeMs: OLD_MTIME,
        browser: 'chrome',
        profile: 'Default',
        cacheKind: 'Cache',
      },
    ]);
    expect(preview.sources[0]).toMatchObject({
      category: 'browser-cache',
      status: 'ok',
      candidateCount: 2,
      estimatedBytes: 70,
      inaccessibleDirectories: 0,
    });
    expect(preview.sources[0].minAgeHours).toBeUndefined();
  });

  it('reports the browser source as empty when no browser is installed', async () => {
    const preview = await buildCleanupPreview(['browser-cache'], fakeFs({}, {}), {
      env: BROWSER_ENV,
    });
    expect(preview.candidates).toEqual([]);
    expect(preview.sources[0]).toMatchObject({
      category: 'browser-cache',
      status: 'empty',
      candidateCount: 0,
    });
    expect(preview.sources[0].reason).toBeUndefined();
  });

  it('reports the browser source unavailable when the environment is broken', async () => {
    const preview = await buildCleanupPreview(['browser-cache'], fakeFs({}, {}), { env: {} });
    expect(preview.sources[0]).toMatchObject({ status: 'unavailable', candidateCount: 0 });
    expect(preview.sources[0].reason).toContain('переменные окружения');
  });

  it('reports the browser source unavailable with the reason when browser directories are denied', async () => {
    const fs = fakeFs({ [CHROME_BASE]: [['Default', 'dir']] }, {}, [CHROME_BASE]);
    const preview = await buildCleanupPreview(['browser-cache'], fs, { env: BROWSER_ENV });
    expect(preview.sources[0]).toMatchObject({ status: 'unavailable', candidateCount: 0 });
    expect(preview.sources[0].reason).toContain('права администратора');
  });

  it('keeps the browser source partial when one profile tree is denied and another is found', async () => {
    const cacheRoot = `${CHROME_BASE}\\Default\\Cache`;
    const fs = fakeFs(
      {
        [CHROME_BASE]: [['Default', 'dir']],
        [`${CHROME_BASE}\\Default`]: [
          ['Preferences', 'file'],
          ['Cache', 'dir'],
        ],
        [cacheRoot]: [],
      },
      {},
      [EDGE_BASE]
    );
    const preview = await buildCleanupPreview(['browser-cache'], fs, { env: BROWSER_ENV });
    expect(preview.sources[0]).toMatchObject({ status: 'partial', candidateCount: 0 });
    expect(preview.sources[0].reason).toContain('права администратора');
  });

  it('reports an available browser source without cache files as empty, not unavailable', async () => {
    const cacheRoot = `${CHROME_BASE}\\Default\\Cache`;
    const fs = fakeFs(
      {
        [CHROME_BASE]: [['Default', 'dir']],
        [`${CHROME_BASE}\\Default`]: [
          ['Preferences', 'file'],
          ['Cache', 'dir'],
        ],
        [cacheRoot]: [],
      },
      {}
    );
    const preview = await buildCleanupPreview(['browser-cache'], fs, { env: BROWSER_ENV });
    expect(preview.candidates).toEqual([]);
    expect(preview.sources[0]).toMatchObject({
      status: 'empty',
      candidateCount: 0,
      estimatedBytes: 0,
    });
    expect(preview.sources[0].reason).toBeUndefined();
  });

  it('keeps a candidate of another category out of the walked source', async () => {
    // Пересечение корней правил: файл лежит в обойдённом корне, но правило отдаёт его
    // чужой категории — он не должен попасть в кандидаты и статистику своей (issue #58).
    const root = 'C:\\Sandbox\\Temp';
    const rules: CleanupRule[] = [
      { kind: 'file', category: 'log-files', allowRoot: root, pattern: /\.log$/ },
      { kind: 'file', category: 'user-temp', allowRoot: root, pattern: /\.tmp$/ },
    ];
    const fs = fakeFs(
      {
        [root]: [
          ['x.log', 'file'],
          ['x.tmp', 'file'],
        ],
      },
      { [`${root}\\x.log`]: 5, [`${root}\\x.tmp`]: 7 }
    );
    const preview = await buildCleanupPreview(['user-temp'], fs, { rules });
    expect(preview.candidates).toEqual([
      { path: `${root}\\x.tmp`, sizeBytes: 7, category: 'user-temp', mtimeMs: OLD_MTIME },
    ]);
    expect(preview.sources[0]).toMatchObject({ category: 'user-temp', candidateCount: 1 });
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
      { kind: 'file', category: 'user-temp', allowRoot: 'C:\\Sandbox\\Temp', pattern: /./ },
      {
        kind: 'file',
        category: 'user-temp',
        allowRoot: 'C:\\Sandbox\\Temp\\nested',
        pattern: /./,
      },
      { kind: 'file', category: 'user-temp', allowRoot: 'c:/sandbox/temp', pattern: /./ },
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
