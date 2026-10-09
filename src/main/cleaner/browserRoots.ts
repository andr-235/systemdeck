import type { CleanupBrowser, CleanupCacheKind } from '@shared/ipc/contracts';
import { errorCode } from './errors';
import type { CleanupFileRule } from './rules';
import { envDir, localAppDataDir, type Env } from './systemRoots';
import type { CleanerDirEntry, CleanerFs } from './walker';

/** Точный каталог кэша подтверждённого профиля: единственный allow-корень категории. */
export type BrowserCacheRoot = {
  browser: CleanupBrowser;
  profile: string;
  cacheKind: CleanupCacheKind;
  path: string;
};

/** Каталог браузера/профилей, который существует, но прочитать его нельзя (issue #58). */
export type BrowserDeniedRoot = { root: string; code?: string };

export type BrowserDiscovery = {
  roots: BrowserCacheRoot[];
  denied: BrowserDeniedRoot[];
  /** Ни %LOCALAPPDATA%, ни %APPDATA% не дали допустимого каталога (сломанное окружение). */
  envMissing: boolean;
};

/** Обнаружение не выполнялось (заданные правила в тестах): отказов и сломанного окружения нет. */
export const EMPTY_BROWSER_DISCOVERY: BrowserDiscovery = {
  roots: [],
  denied: [],
  envMissing: false,
};

type DirRead =
  { ok: true; entries: CleanerDirEntry[] } | { ok: false; code?: string; missing: boolean };

const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR']);

/** Чтение каталога: отсутствие — «браузер не установлен», любой другой отказ — недоступность. */
async function readDir(fs: CleanerFs, path: string): Promise<DirRead> {
  try {
    return { ok: true, entries: await fs.readdir(path) };
  } catch (error) {
    const code = errorCode(error);
    const missing = code !== undefined && MISSING_CODES.has(code);
    return { ok: false, ...(code === undefined ? {} : { code }), missing };
  }
}

const CHROMIUM_CACHE_KINDS: readonly CleanupCacheKind[] = ['Cache', 'Code Cache', 'GPUCache'];
const FIREFOX_CACHE_KIND: CleanupCacheKind = 'cache2';

type BrowserBase = { browser: CleanupBrowser; chromium: boolean; path: string };

/** Разрешённый список установок: только Chrome, Edge и Firefox текущего пользователя. */
function browserBases(env: Env): BrowserBase[] {
  const bases: BrowserBase[] = [];
  const local = localAppDataDir(env);
  const roaming = envDir(env, 'APPDATA');
  if (local !== null) {
    bases.push({
      browser: 'chrome',
      chromium: true,
      path: `${local}\\Google\\Chrome\\User Data`,
    });
    bases.push({ browser: 'edge', chromium: true, path: `${local}\\Microsoft\\Edge\\User Data` });
  }
  if (roaming !== null) {
    bases.push({
      browser: 'firefox',
      chromium: false,
      path: `${roaming}\\Mozilla\\Firefox\\Profiles`,
    });
  }
  return bases;
}

/**
 * Обнаружение профилей и точных каталогов их кэша (issue #58): каталоги данных
 * перечисляются в Main, symlink/junction-профили и symlink-каталоги кэша не следуются,
 * отсутствие браузера не считается ошибкой.
 */
export async function discoverBrowserCacheRoots(
  env: Env,
  fs: CleanerFs
): Promise<BrowserDiscovery> {
  const discovery: BrowserDiscovery = {
    roots: [],
    denied: [],
    envMissing: localAppDataDir(env) === null && envDir(env, 'APPDATA') === null,
  };
  for (const base of browserBases(env)) {
    await scanBase(base, fs, discovery);
  }
  return discovery;
}

async function scanBase(
  base: BrowserBase,
  fs: CleanerFs,
  discovery: BrowserDiscovery
): Promise<void> {
  const read = await readDir(fs, base.path);
  if (!read.ok) {
    if (!read.missing) {
      discovery.denied.push({
        root: base.path,
        ...(read.code === undefined ? {} : { code: read.code }),
      });
    }
    return;
  }
  for (const entry of read.entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      continue;
    }
    const profilePath = `${base.path}\\${entry.name}`;
    const profile = await readDir(fs, profilePath);
    if (!profile.ok) {
      if (!profile.missing) {
        discovery.denied.push({
          root: profilePath,
          ...(profile.code === undefined ? {} : { code: profile.code }),
        });
      }
      continue;
    }
    if (base.chromium) {
      await collectChromiumCache(
        base.browser,
        entry.name,
        profilePath,
        profile.entries,
        fs,
        discovery
      );
    } else {
      await collectFirefoxCache(entry.name, profilePath, profile.entries, fs, discovery);
    }
  }
}

/**
 * Подтверждение корня кэша: сам каталог должен читаться — исчезнувший после превью или
 * недоступный корень не превращается в allow-правило (issue #58, REQ-007).
 */
async function confirmCacheRoot(
  fs: CleanerFs,
  path: string,
  meta: Omit<BrowserCacheRoot, 'path'>,
  discovery: BrowserDiscovery
): Promise<void> {
  const read = await readDir(fs, path);
  if (read.ok) {
    discovery.roots.push({ ...meta, path });
    return;
  }
  if (!read.missing) {
    discovery.denied.push({ root: path, ...(read.code === undefined ? {} : { code: read.code }) });
  }
}

/** Профиль Chromium подтверждается файлом `Preferences`; кэши — точные подкаталоги профиля. */
async function collectChromiumCache(
  browser: CleanupBrowser,
  profile: string,
  profilePath: string,
  entries: readonly CleanerDirEntry[],
  fs: CleanerFs,
  discovery: BrowserDiscovery
): Promise<void> {
  const confirmed = entries.some(
    (e) => e.name === 'Preferences' && e.isFile() && !e.isSymbolicLink()
  );
  if (!confirmed) {
    return;
  }
  for (const cacheKind of CHROMIUM_CACHE_KINDS) {
    const cache = entries.find((e) => e.name === cacheKind);
    if (cache?.isDirectory() && !cache.isSymbolicLink()) {
      await confirmCacheRoot(
        fs,
        `${profilePath}\\${cacheKind}`,
        { browser, profile, cacheKind },
        discovery
      );
    }
  }
}

/** Профиль Firefox подтверждается `prefs.js`; кэш — только `cache2` внутри профиля. */
async function collectFirefoxCache(
  profile: string,
  profilePath: string,
  entries: readonly CleanerDirEntry[],
  fs: CleanerFs,
  discovery: BrowserDiscovery
): Promise<void> {
  const confirmed = entries.some((e) => e.name === 'prefs.js' && e.isFile() && !e.isSymbolicLink());
  const cache = entries.find((e) => e.name === FIREFOX_CACHE_KIND);
  if (!confirmed || !cache?.isDirectory() || cache.isSymbolicLink()) {
    return;
  }
  await confirmCacheRoot(
    fs,
    `${profilePath}\\${FIREFOX_CACHE_KIND}`,
    { browser: 'firefox', profile, cacheKind: FIREFOX_CACHE_KIND },
    discovery
  );
}

/**
 * Allow-правила обнаруженных кэшей: паттерн отсутствует — любое содержимое строго под
 * точным каталогом кэша; всё вне этих корней правилом browser-cache не покрывается.
 */
export function browserCacheRules(discovery: BrowserDiscovery): CleanupFileRule[] {
  return discovery.roots.map((root) => ({
    kind: 'file',
    category: 'browser-cache',
    allowRoot: root.path,
    browser: root.browser,
    profile: root.profile,
    cacheKind: root.cacheKind,
  }));
}
