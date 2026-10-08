import { describe, expect, it } from 'vitest';
import { collectCleanupCandidates, type CleanerDirEntry, type CleanerFs } from './walker';

function entry(name: string, kind: 'file' | 'dir' | 'symlink'): CleanerDirEntry {
  return {
    name,
    isDirectory: () => kind === 'dir',
    isFile: () => kind === 'file',
    isSymbolicLink: () => kind === 'symlink',
  };
}

function fakeFs(): CleanerFs {
  const dirs = new Map<string, CleanerDirEntry[]>([
    [
      'R:\\Temp',
      [
        entry('a.tmp', 'file'),
        entry('sub', 'dir'),
        entry('linkdir', 'symlink'),
        entry('locked', 'dir'),
        entry('badstat.tmp', 'file'),
      ],
    ],
    ['R:\\Temp\\sub', [entry('b.tmp', 'file')]],
    ['R:\\Temp\\linkdir', [entry('victim.tmp', 'file')]],
  ]);
  return {
    readdir: async (path) => {
      if (path === 'R:\\Temp\\locked') {
        throw new Error('EACCES');
      }
      const children = dirs.get(path);
      if (!children) {
        throw new Error(`NO_SUCH_DIR ${path}`);
      }
      return children;
    },
    stat: async (path) => {
      if (path.endsWith('badstat.tmp')) {
        throw new Error('EACCES');
      }
      const sizes: Record<string, number> = { 'R:\\Temp\\a.tmp': 10, 'R:\\Temp\\sub\\b.tmp': 20 };
      return { size: sizes[path] ?? 0, isFile: () => true };
    },
  };
}

describe('cleanup walker', () => {
  it('collects files, skips reparse points, marks inaccessible without abort', async () => {
    const collected = await collectCleanupCandidates(['R:\\Temp'], fakeFs());
    expect(collected.entries.map((item) => item.path).sort()).toEqual([
      'R:\\Temp\\a.tmp',
      'R:\\Temp\\sub\\b.tmp',
    ]);
    expect(collected.inaccessibleDirs).toEqual(['R:\\Temp\\locked']);
  });
});
