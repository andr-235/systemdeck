import { afterAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FileTypeCategory, ScanResult } from '@shared/ipc';
import {
  DEFAULT_MAX_LARGEST_FILES,
  ScanCancelledError,
  isFixedVolumeId,
  nodeScanFs,
  runScan,
  scanTree,
  volumeRootPath,
  type ScanDirEntry,
  type ScanFs,
} from './scan';

type FakeEntryKind = 'file' | 'dir' | 'symlink' | 'unknown';

type FakeEntry = {
  name: string;
  kind: FakeEntryKind;
  size?: number;
  children?: FakeEntry[];
  failReaddir?: boolean;
};

function file(name: string, size: number): FakeEntry {
  return { name, kind: 'file', size };
}

function dir(name: string, children: FakeEntry[], failReaddir = false): FakeEntry {
  return { name, kind: 'dir', children, failReaddir };
}

function symlink(name: string): FakeEntry {
  return { name, kind: 'symlink' };
}

function unknown(name: string, size: number): FakeEntry {
  return { name, kind: 'unknown', size };
}

function toScanDirEntry(entry: FakeEntry): ScanDirEntry {
  return {
    name: entry.name,
    isDirectory: (): boolean => entry.kind === 'dir',
    isFile: (): boolean => entry.kind === 'file' || entry.kind === 'unknown',
    isSymbolicLink: (): boolean => entry.kind === 'symlink',
  };
}

function fakeScanFs(root: FakeEntry, rootPath: string): ScanFs {
  const byPath = new Map<string, FakeEntry>();
  byPath.set(rootPath, root);
  const index = (path: string, entries: FakeEntry[]): void => {
    for (const entry of entries) {
      const childPath = path.endsWith('\\') ? `${path}${entry.name}` : `${path}\\${entry.name}`;
      byPath.set(childPath, entry);
      if (entry.children) {
        index(childPath, entry.children);
      }
    }
  };
  index(rootPath, root.children ?? []);
  const failPaths = new Set<string>();
  for (const [path, entry] of byPath) {
    if (entry.failReaddir) {
      failPaths.add(path);
    }
  }
  return {
    readdir: async (path: string) => {
      if (failPaths.has(path)) {
        const error = new Error(`ACCESS_DENIED ${path}`) as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      }
      const parent = byPath.get(path);
      if (!parent?.children) {
        throw new Error(`NO_SUCH_DIR ${path}`);
      }
      return parent.children.map(toScanDirEntry);
    },
    stat: async (path: string) => {
      const entry = byPath.get(path);
      if (!entry || entry.kind === 'dir') {
        throw new Error(`NO_SUCH_FILE ${path}`);
      }
      return { size: entry.size ?? 0, isFile: (): boolean => true };
    },
  };
}

const volumeFixture: FakeEntry = dir('C:', [
  dir('Games', [
    file('quake.exe', 500),
    dir('saves', [file('game.sav', 120)]),
  ]),
  dir('Windows', [file('system.dll', 100), file('win.ini', 200)]),
  dir('locked', [file('secret.dat', 999)], true),
  file('readme.md', 50),
  symlink('shortcut.lnk'),
  unknown('file.weird', 10),
]);

const fixtureResult: Omit<ScanResult, 'timestamp' | 'durationMs'> = {
  volumeId: 'C:',
  totalBytes: 980,
  fileCount: 6,
  inaccessibleDirectories: 1,
  tree: {
    name: 'C:',
    path: 'C:\\',
    sizeBytes: 980,
    filesBytes: 60,
    fileCount: 6,
    inaccessible: false,
    children: [
      {
        name: 'Games',
        path: 'C:\\Games',
        sizeBytes: 620,
        filesBytes: 500,
        fileCount: 2,
        inaccessible: false,
        children: [
          {
            name: 'saves',
            path: 'C:\\Games\\saves',
            sizeBytes: 120,
            filesBytes: 120,
            fileCount: 1,
            inaccessible: false,
            children: [],
          },
        ],
      },
      {
        name: 'Windows',
        path: 'C:\\Windows',
        sizeBytes: 300,
        filesBytes: 300,
        fileCount: 2,
        inaccessible: false,
        children: [],
      },
      {
        name: 'locked',
        path: 'C:\\locked',
        sizeBytes: 0,
        filesBytes: 0,
        fileCount: 0,
        inaccessible: true,
        children: [],
      },
    ],
  },
  largestFiles: [
    { path: 'C:\\Games\\quake.exe', name: 'quake.exe', sizeBytes: 500, category: 'Installers' },
    { path: 'C:\\Windows\\win.ini', name: 'win.ini', sizeBytes: 200, category: 'Code' },
    { path: 'C:\\Games\\saves\\game.sav', name: 'game.sav', sizeBytes: 120, category: 'Other' },
    { path: 'C:\\Windows\\system.dll', name: 'system.dll', sizeBytes: 100, category: 'System' },
    { path: 'C:\\readme.md', name: 'readme.md', sizeBytes: 50, category: 'Documents' },
    { path: 'C:\\file.weird', name: 'file.weird', sizeBytes: 10, category: 'Other' },
  ],
  typeTotals: [
    { category: 'Documents', sizeBytes: 50, fileCount: 1 },
    { category: 'Images', sizeBytes: 0, fileCount: 0 },
    { category: 'Video', sizeBytes: 0, fileCount: 0 },
    { category: 'Audio', sizeBytes: 0, fileCount: 0 },
    { category: 'Archives', sizeBytes: 0, fileCount: 0 },
    { category: 'Installers', sizeBytes: 500, fileCount: 1 },
    { category: 'Code', sizeBytes: 200, fileCount: 1 },
    { category: 'System', sizeBytes: 100, fileCount: 1 },
    { category: 'Other', sizeBytes: 130, fileCount: 2 },
  ],
};

function expectBasicTreeNodes(result: ScanResult): void {
  expect(result.tree.name).toBe('C:');
  expect(result.tree.path).toBe('C:\\');
  expect(result.tree.inaccessible).toBe(false);
}

describe('volume id helpers', () => {
  it('accepts single uppercase or lowercase latin letter followed by colon', () => {
    expect(isFixedVolumeId('C:')).toBe(true);
    expect(isFixedVolumeId('d:')).toBe(true);
  });

  it('rejects malformed volume ids', () => {
    for (const bad of ['C', 'C:\\', 'CC:', '1:', ':C', '', 'c: ', 'C:/']) {
      expect(isFixedVolumeId(bad), bad).toBe(false);
    }
  });

  it('expands a volume id to a root path with trailing separator', () => {
    expect(volumeRootPath('C:')).toBe('C:\\');
    expect(volumeRootPath('d:')).toBe('d:\\');
  });

  it('refuses to expand a malformed volume id', () => {
    expect(() => volumeRootPath('C')).toThrow();
  });
});

describe('runScan', () => {
  it('computes the full fixture result as an independent known literal', async () => {
    const fs = fakeScanFs(volumeFixture, 'C:\\');
    const result = await runScan('C:', fs);
    const { timestamp, durationMs, ...rest } = result;
    expect(timestamp).toBeGreaterThan(0);
    expect(durationMs).toBeGreaterThanOrEqual(0);
    expect(rest).toEqual(fixtureResult);
    expectBasicTreeNodes(result);
  });

  it('keeps only the requested number of largest files', async () => {
    const fs = fakeScanFs(volumeFixture, 'C:\\');
    const result = await runScan('C:', fs, { maxLargestFiles: 2 });
    expect(result.largestFiles.map((f) => f.name)).toEqual(['quake.exe', 'win.ini']);
  });

  it('uses DEFAULT_MAX_LARGEST_FILES when not specified', async () => {
    const fs = fakeScanFs(volumeFixture, 'C:\\');
    const result = await runScan('C:', fs);
    expect(result.largestFiles).toHaveLength(6);
  });

  it('throws on cancellation', async () => {
    const fs = fakeScanFs(volumeFixture, 'C:\\');
    let checks = 0;
    await expect(
      runScan('C:', fs, {
        isCancelled: () => {
          checks++;
          return checks > 2;
        },
      })
    ).rejects.toBeInstanceOf(ScanCancelledError);
  });
});

describe('scanTree', () => {
  it('exposes a default max largest files constant', () => {
    expect(DEFAULT_MAX_LARGEST_FILES).toBe(100);
  });

  it('reports monotonic progress and final counters matching the result', async () => {
    const fs = fakeScanFs(volumeFixture, 'C:\\');
    const events: number[] = [];
    const result = await scanTree('C:\\', fs, {
      maxLargestFiles: 100,
      onProgress: (progress) => {
        events.push(progress.scannedBytes);
        expect(progress.inaccessibleDirectories).toBeGreaterThanOrEqual(0);
        expect(progress.scannedEntries).toBeGreaterThan(0);
      },
    });
    expect(result.tree.sizeBytes).toBe(980);
    expect(result.inaccessibleDirectories).toBe(1);
    expect(events.length).toBeGreaterThan(0);
    expect(Math.max(...events)).toBeLessThanOrEqual(result.scannedBytes);
  });
});

describe('real node fs integration', () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    await Promise.all(tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })));
  });

  it('walks a real temporary directory tree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'systemdeck-scan-'));
    tempDirs.push(root);
    await mkdir(join(root, 'sub'));
    await mkdir(join(root, 'sub', 'dirA'), { recursive: true });
    await writeFile(join(root, 'sub', 'dirA', 'file1.bin'), Buffer.alloc(7));
    await writeFile(join(root, 'sub', 'readme.txt'), Buffer.alloc(5));
    await writeFile(join(root, 'sub', 'file2.dat'), Buffer.alloc(3));

    const result = await scanTree(join(root, 'sub'), nodeScanFs);

    expect(result.tree.name).toBe('sub');
    expect(result.tree.sizeBytes).toBe(15);
    expect(result.tree.fileCount).toBe(3);
    expect(result.tree.filesBytes).toBe(8);
    expect(result.tree.children.map((child) => child.name)).toEqual(['dirA']);
    expect(result.tree.children[0].sizeBytes).toBe(7);
    expect(result.inaccessibleDirectories).toBe(0);
  });
});

function expectTypeTotal(
  totals: { category: FileTypeCategory; sizeBytes: number; fileCount: number }[],
  category: FileTypeCategory
): void {
  const total = totals.find((t) => t.category === category);
  expect(total, category).toBeDefined();
  expect(total?.fileCount).toBeGreaterThan(0);
}

it('file category aggregation is exercised across categories', async () => {
  const fs = fakeScanFs(volumeFixture, 'C:\\');
  const result = await runScan('C:', fs);
  expectTypeTotal(result.typeTotals, 'Documents');
  expectTypeTotal(result.typeTotals, 'Installers');
  expectTypeTotal(result.typeTotals, 'Code');
  expectTypeTotal(result.typeTotals, 'System');
  expectTypeTotal(result.typeTotals, 'Other');
});