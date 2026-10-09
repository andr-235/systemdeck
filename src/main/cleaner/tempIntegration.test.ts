import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCleanupCandidates, isDeletionAllowed } from './candidates';
import { nodeCleanerDeleteFs, runCleanup } from './deleter';
import { cleanerRules } from './rules';
import { envDir } from './systemRoots';
import { userTempRoots, windowsTempRoot } from './tempRoots';
import { collectCleanupCandidates, nodeCleanerFs } from './walker';

/** Ограниченный интеграционный тест: только win32 и только собственный каталог в TEMP. */
const itWindows = process.platform === 'win32' ? it : it.skip;
const HOUR_MS = 3_600_000;

describe('cleaner temp integration on the real file system', () => {
  itWindows(
    'classifies and deletes only its own old file inside the confirmed temp root',
    async () => {
      const roots = userTempRoots();
      expect(roots.length).toBeGreaterThan(0);
      const sandbox = join(roots[0], `systemdeck-it-${randomUUID()}`);
      await mkdir(sandbox, { recursive: true });
      try {
        const oldPath = join(sandbox, 'old.tmp');
        const youngPath = join(sandbox, 'young.tmp');
        await writeFile(oldPath, 'old-data');
        await writeFile(youngPath, 'young-data');
        const past = new Date(Date.now() - 48 * HOUR_MS);
        await utimes(oldPath, past, past);

        const collected = await collectCleanupCandidates([sandbox], nodeCleanerFs);
        expect(collected.unavailableRoots).toEqual([]);
        const built = buildCleanupCandidates(collected.entries, { rules: cleanerRules() });
        expect(built.candidates.map((candidate) => candidate.path)).toEqual([oldPath]);
        expect(built.skippedTooYoung).toBe(1);
        expect(isDeletionAllowed(oldPath)).toEqual({ allowed: true });

        const first = built.candidates[0];
        const items = await runCleanup(
          [
            {
              id: 'integration:1',
              path: first.path,
              sizeBytes: first.sizeBytes,
              category: first.category,
              mtimeMs: first.mtimeMs,
            },
          ],
          { fs: nodeCleanerDeleteFs, isCancelled: () => false, rules: cleanerRules() }
        );
        expect(items).toEqual([{ path: oldPath, outcome: 'deleted', bytesFreed: 8 }]);
        await expect(stat(oldPath)).rejects.toThrow();
        // Молодой файл остаётся нетронутым: порог возраста отделяет активные данные.
        await expect(stat(youngPath)).resolves.toBeTruthy();
      } finally {
        await rm(sandbox, { recursive: true, force: true });
      }
    }
  );

  itWindows(
    'derives the windows temp root from the real environment without a hardcoded drive',
    () => {
      const systemDir = envDir(process.env, 'WINDIR') ?? envDir(process.env, 'SystemRoot');
      expect(systemDir).not.toBeNull();
      expect(windowsTempRoot()).toBe(`${systemDir}\\Temp`);
    }
  );
});
