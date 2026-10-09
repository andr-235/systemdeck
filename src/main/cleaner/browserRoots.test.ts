import { describe, expect, it } from 'vitest';
import { browserCacheRules, discoverBrowserCacheRoots } from './browserRoots';
import { isDeletionAllowed } from './candidates';
import { findCleanupRule } from './rules';
import type { Env } from './systemRoots';
import type { CleanerDirEntry, CleanerFs } from './walker';

const LOCAL = 'C:\\Users\\alice\\AppData\\Local';
const ROAMING = 'C:\\Users\\alice\\AppData\\Roaming';
const CHROME = `${LOCAL}\\Google\\Chrome\\User Data`;
const EDGE = `${LOCAL}\\Microsoft\\Edge\\User Data`;
const FIREFOX = `${ROAMING}\\Mozilla\\Firefox\\Profiles`;

const ENV: Env = { LOCALAPPDATA: LOCAL, APPDATA: ROAMING };

function dirent(name: string, kind: 'file' | 'dir' | 'link-dir'): CleanerDirEntry {
  const symlink = kind === 'link-dir';
  return {
    name,
    isDirectory: () => kind === 'dir',
    isFile: () => kind === 'file',
    isSymbolicLink: () => symlink,
  };
}

function fakeFs(tree: Record<string, CleanerDirEntry[]>, locked: string[] = []): CleanerFs {
  return {
    readdir: async (path) => {
      if (locked.includes(path)) {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      }
      const children = tree[path];
      if (!children) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return children;
    },
    stat: async () => {
      throw new Error('обнаружение профилей stat не выполняет');
    },
  };
}

/** Мок нескольких профилей: Chrome (2 профиля + служебный каталог), Edge, Firefox (2). */
function multiProfileTree(): Record<string, CleanerDirEntry[]> {
  return {
    [CHROME]: [
      dirent('Default', 'dir'),
      dirent('Profile 2', 'dir'),
      dirent('Crashpad', 'dir'),
      dirent('Linked', 'link-dir'),
    ],
    [`${CHROME}\\Default`]: [
      dirent('Preferences', 'file'),
      dirent('Cache', 'dir'),
      dirent('Code Cache', 'dir'),
      dirent('GPUCache', 'dir'),
      dirent('Service Worker', 'dir'),
      dirent('Local Storage', 'dir'),
      dirent('Cookies', 'file'),
      dirent('History', 'file'),
    ],
    [`${CHROME}\\Profile 2`]: [
      dirent('Preferences', 'file'),
      dirent('Cache', 'link-dir'),
      dirent('Code Cache', 'dir'),
    ],
    [`${CHROME}\\Crashpad`]: [dirent('settings.dat', 'file')],
    [`${CHROME}\\Linked`]: [dirent('Preferences', 'file'), dirent('Cache', 'dir')],
    [EDGE]: [dirent('Default', 'dir')],
    [`${EDGE}\\Default`]: [dirent('Preferences', 'file'), dirent('Cache', 'dir')],
    [FIREFOX]: [dirent('abc.default', 'dir'), dirent('plain', 'dir')],
    [`${FIREFOX}\\abc.default`]: [dirent('prefs.js', 'file'), dirent('cache2', 'dir')],
    [`${FIREFOX}\\plain`]: [dirent('cache2', 'dir')],
    // Сами каталоги кэша должны читаться, иначе корень не подтверждён (issue #58).
    [`${CHROME}\\Default\\Cache`]: [],
    [`${CHROME}\\Default\\Code Cache`]: [],
    [`${CHROME}\\Default\\GPUCache`]: [],
    [`${CHROME}\\Profile 2\\Code Cache`]: [],
    [`${EDGE}\\Default\\Cache`]: [],
    [`${FIREFOX}\\abc.default\\cache2`]: [],
  };
}

describe('browser cache profile discovery', () => {
  it('discovers exact cache roots for multiple profiles of chrome, edge and firefox', async () => {
    const discovery = await discoverBrowserCacheRoots(ENV, fakeFs(multiProfileTree()));
    expect(discovery.envMissing).toBe(false);
    expect(discovery.denied).toEqual([]);
    expect(discovery.roots).toEqual([
      {
        browser: 'chrome',
        profile: 'Default',
        cacheKind: 'Cache',
        path: `${CHROME}\\Default\\Cache`,
      },
      {
        browser: 'chrome',
        profile: 'Default',
        cacheKind: 'Code Cache',
        path: `${CHROME}\\Default\\Code Cache`,
      },
      {
        browser: 'chrome',
        profile: 'Default',
        cacheKind: 'GPUCache',
        path: `${CHROME}\\Default\\GPUCache`,
      },
      {
        browser: 'chrome',
        profile: 'Profile 2',
        cacheKind: 'Code Cache',
        path: `${CHROME}\\Profile 2\\Code Cache`,
      },
      { browser: 'edge', profile: 'Default', cacheKind: 'Cache', path: `${EDGE}\\Default\\Cache` },
      {
        browser: 'firefox',
        profile: 'abc.default',
        cacheKind: 'cache2',
        path: `${FIREFOX}\\abc.default\\cache2`,
      },
    ]);
  });

  it('skips symlinked profiles and symlinked cache directories instead of following them', async () => {
    const discovery = await discoverBrowserCacheRoots(ENV, fakeFs(multiProfileTree()));
    const paths = discovery.roots.map((root) => root.path);
    expect(paths).not.toContain(`${CHROME}\\Linked\\Cache`);
    expect(paths).not.toContain(`${CHROME}\\Profile 2\\Cache`);
  });

  it('requires profile confirmation so service directories never become roots', async () => {
    const discovery = await discoverBrowserCacheRoots(ENV, fakeFs(multiProfileTree()));
    const profiles = discovery.roots.map((root) => `${root.browser}:${root.profile}`);
    // Crashpad без Preferences и Firefox-папка без prefs.js профилями не считаются.
    expect(profiles).not.toContain('chrome:Crashpad');
    expect(profiles).not.toContain('firefox:plain');
  });

  it('treats a missing browser installation as absence, not as an error', async () => {
    const tree = multiProfileTree();
    delete tree[EDGE];
    const discovery = await discoverBrowserCacheRoots(ENV, fakeFs(tree));
    expect(discovery.denied).toEqual([]);
    expect(discovery.roots.some((root) => root.browser === 'edge')).toBe(false);
    expect(discovery.roots.some((root) => root.browser === 'chrome')).toBe(true);
  });

  it('records a denied browser directory with the system error code', async () => {
    const discovery = await discoverBrowserCacheRoots(
      ENV,
      fakeFs({ [CHROME]: [dirent('Default', 'dir')] }, [CHROME])
    );
    expect(discovery.denied).toEqual([{ root: CHROME, code: 'EACCES' }]);
    expect(discovery.roots).toEqual([]);
  });

  it('keeps an unreadable cache directory out of the roots and records it as denied', async () => {
    const lockedCache = `${CHROME}\\Default\\Cache`;
    const discovery = await discoverBrowserCacheRoots(
      ENV,
      fakeFs(multiProfileTree(), [lockedCache])
    );
    expect(discovery.roots.some((root) => root.path === lockedCache)).toBe(false);
    expect(discovery.denied).toEqual([{ root: lockedCache, code: 'EACCES' }]);
    // Остальные кэши того же профиля остаются доступными.
    expect(discovery.roots.some((root) => root.path === `${CHROME}\\Default\\Code Cache`)).toBe(
      true
    );
  });

  it('flags a broken environment when neither variable resolves', async () => {
    const discovery = await discoverBrowserCacheRoots({}, fakeFs(multiProfileTree()));
    expect(discovery.envMissing).toBe(true);
    expect(discovery.roots).toEqual([]);
    expect(discovery.denied).toEqual([]);
  });
});

describe('browser cache allow rules', () => {
  it('builds pattern-less rules anchored to the exact cache directories with metadata', async () => {
    const discovery = await discoverBrowserCacheRoots(ENV, fakeFs(multiProfileTree()));
    const rules = browserCacheRules(discovery);
    expect(rules).toHaveLength(discovery.roots.length);
    for (const rule of rules) {
      expect(rule.kind).toBe('file');
      expect(rule.category).toBe('browser-cache');
      expect(rule.pattern).toBeUndefined();
      expect(rule.allowRoot.length).toBeGreaterThan(0);
      expect(rule.browser).toBeDefined();
      expect(rule.profile).toBeDefined();
      expect(rule.cacheKind).toBeDefined();
    }
  });

  it('never offers or allows forbidden profile data paths', async () => {
    const discovery = await discoverBrowserCacheRoots(ENV, fakeFs(multiProfileTree()));
    const rules = browserCacheRules(discovery);
    const chromeProfile = `${CHROME}\\Default`;
    const firefoxProfile = `${FIREFOX}\\abc.default`;
    const forbidden = [
      `${chromeProfile}\\Service Worker\\CacheStorage\\abc\\index-dir\\manifest`,
      `${chromeProfile}\\IndexedDB\\https_example.com_0.indexeddb.leveldb\\000001.log`,
      `${chromeProfile}\\Local Storage\\leveldb\\000003.ldb`,
      `${chromeProfile}\\Session Storage\\sess.data`,
      `${chromeProfile}\\Cookies`,
      `${chromeProfile}\\History`,
      `${chromeProfile}\\Bookmarks`,
      `${chromeProfile}\\Login Data`,
      `${firefoxProfile}\\places.sqlite`,
      `${firefoxProfile}\\logins.json`,
      `${firefoxProfile}\\key4.db`,
      `${firefoxProfile}\\cert9.db`,
    ];
    for (const path of forbidden) {
      expect(findCleanupRule(path, rules), path).toBeUndefined();
      expect(isDeletionAllowed(path, rules), path).toEqual({
        allowed: false,
        code: 'CLEAN_OUTSIDE_RULES',
      });
    }
  });

  it('allows only content strictly under the cache root, not the root or its siblings', async () => {
    const discovery = await discoverBrowserCacheRoots(ENV, fakeFs(multiProfileTree()));
    const rules = browserCacheRules(discovery);
    const root = `${CHROME}\\Default\\Cache`;
    expect(isDeletionAllowed(`${root}\\data_0`, rules)).toEqual({ allowed: true });
    expect(isDeletionAllowed(`${root}\\Cache_Data\\f_1`, rules)).toEqual({ allowed: true });
    expect(isDeletionAllowed(root, rules)).toEqual({
      allowed: false,
      code: 'CLEAN_OUTSIDE_RULES',
    });
    expect(isDeletionAllowed(`${root}2\\data_0`, rules)).toEqual({
      allowed: false,
      code: 'CLEAN_OUTSIDE_RULES',
    });
  });
});
