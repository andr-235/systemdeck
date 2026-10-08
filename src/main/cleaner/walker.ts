import { readdir, stat } from 'node:fs/promises';
import type { RawCleanupEntry } from './candidates';

export type CleanerDirEntry = {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
};

/** Граница ФС для walker (fake fs в тестах, прецедент ScanFs, ADR 0013). */
export interface CleanerFs {
  readdir(path: string): Promise<CleanerDirEntry[]>;
  stat(path: string): Promise<{ size: number; isFile(): boolean }>;
}

export type CollectResult = {
  entries: RawCleanupEntry[];
  /** Каталоги с запретом чтения: помечены, обход продолжен (ADR 0013). */
  inaccessibleDirs: string[];
};

function joinCleanerPath(dir: string, name: string): string {
  return dir.endsWith('\\') ? `${dir}${name}` : `${dir}\\${name}`;
}

/** Обход только allow-корней; Reparse Point никогда не обходятся. */
export async function collectCleanupCandidates(
  roots: readonly string[],
  fs: CleanerFs
): Promise<CollectResult> {
  const result: CollectResult = { entries: [], inaccessibleDirs: [] };
  for (const root of roots) {
    await walkRoot(root, fs, result);
  }
  return result;
}

async function walkRoot(dirPath: string, fs: CleanerFs, result: CollectResult): Promise<void> {
  let children: CleanerDirEntry[];
  try {
    children = await fs.readdir(dirPath);
  } catch {
    result.inaccessibleDirs.push(dirPath);
    return;
  }
  for (const entry of children) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const full = joinCleanerPath(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walkRoot(full, fs, result);
    } else {
      const size = await fs.stat(full).then(
        (s) => (s.isFile() ? s.size : null),
        () => null
      );
      if (size !== null) {
        result.entries.push({ path: full, sizeBytes: size });
      }
    }
  }
}

/** Реальный node fs для Main (dirent-флаги: symlink/junction не обходятся). */
export const nodeCleanerFs: CleanerFs = {
  readdir: (path: string) => readdir(path, { withFileTypes: true }),
  stat: async (path: string) => {
    const info = await stat(path);
    return { size: info.size, isFile: () => info.isFile() };
  },
};
