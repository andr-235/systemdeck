import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverBrowserCacheRoots } from './browserRoots';
import { isDeletionAllowed } from './candidates';
import { nodeCleanerDeleteFs, runCleanup } from './deleter';
import { buildCleanupPreview } from './preview';
import { resolveCleanupRules } from './resolveRules';
import type { Env } from './systemRoots';
import { nodeCleanerFs } from './walker';

/** Ограниченный интеграционный тест: только win32 и только собственный sandbox в %TEMP%. */
const itWindows = process.platform === 'win32' ? it : it.skip;

describe('cleaner browser cache integration on the real file system', () => {
  itWindows(
    'discovers, previews and deletes only cache files inside its own sandbox profiles',
    async () => {
      const sandbox = join(tmpdir(), `systemdeck-browser-it-${randomUUID()}`);
      const local = join(sandbox, 'Local');
      const roaming = join(sandbox, 'Roaming');
      const chromeProfile = join(local, 'Google', 'Chrome', 'User Data', 'Default');
      const chromeCache = join(chromeProfile, 'Cache');
      const firefoxProfile = join(roaming, 'Mozilla', 'Firefox', 'Profiles', 'abc.default');
      const firefoxCache = join(firefoxProfile, 'cache2');
      await mkdir(chromeCache, { recursive: true });
      await mkdir(join(chromeProfile, 'Local Storage'), { recursive: true });
      await mkdir(firefoxCache, { recursive: true });
      await writeFile(join(chromeProfile, 'Preferences'), '{}');
      await writeFile(join(chromeProfile, 'Cookies'), 'secret');
      await writeFile(join(chromeProfile, 'History'), 'history');
      await writeFile(join(chromeProfile, 'Local Storage', '000003.ldb'), 'offline');
      await writeFile(join(chromeCache, 'data_0'), 'cached!');
      await writeFile(join(firefoxProfile, 'prefs.js'), 'pref');
      await writeFile(join(firefoxProfile, 'places.sqlite'), 'places');
      await writeFile(join(firefoxCache, 'entry1'), 'ffcache');
      const env: Env = { LOCALAPPDATA: local, APPDATA: roaming };
      try {
        const discovery = await discoverBrowserCacheRoots(env, nodeCleanerFs);
        expect(discovery.denied).toEqual([]);
        expect(discovery.roots.map((root) => root.cacheKind).sort()).toEqual(['Cache', 'cache2']);

        const preview = await buildCleanupPreview(['browser-cache'], nodeCleanerFs, { env });
        expect(preview.sources[0]).toMatchObject({ status: 'ok', candidateCount: 2 });
        expect(preview.candidates.map((candidate) => candidate.path).sort()).toEqual(
          [join(chromeCache, 'data_0'), join(firefoxCache, 'entry1')].sort()
        );
        expect(preview.candidates.every((candidate) => candidate.browser !== undefined)).toBe(true);

        const { rules } = await resolveCleanupRules(nodeCleanerFs, env);
        for (const forbidden of [
          join(chromeProfile, 'Cookies'),
          join(chromeProfile, 'History'),
          join(chromeProfile, 'Local Storage', '000003.ldb'),
          join(firefoxProfile, 'places.sqlite'),
        ]) {
          expect(isDeletionAllowed(forbidden, rules), forbidden).toEqual({
            allowed: false,
            code: 'CLEAN_OUTSIDE_RULES',
          });
        }

        const items = await runCleanup(
          preview.candidates.map((candidate, index) => ({ id: `it:${index}`, ...candidate })),
          { fs: nodeCleanerDeleteFs, isCancelled: () => false, rules }
        );
        expect(items.every((item) => item.outcome === 'deleted')).toBe(true);
        await expect(stat(join(chromeCache, 'data_0'))).rejects.toThrow();
        await expect(stat(join(firefoxCache, 'entry1'))).rejects.toThrow();
        // Запретные файлы профиля не затрагиваются.
        await expect(stat(join(chromeProfile, 'Cookies'))).resolves.toBeTruthy();
        await expect(stat(join(chromeProfile, 'Preferences'))).resolves.toBeTruthy();
        await expect(stat(join(firefoxProfile, 'places.sqlite'))).resolves.toBeTruthy();
      } finally {
        await rm(sandbox, { recursive: true, force: true });
      }
    }
  );
});
