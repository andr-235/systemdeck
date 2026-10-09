import { readdir, stat } from 'node:fs/promises';
import type { RawCleanupEntry } from './candidates';
import { errorCode } from './errors';

export type CleanerDirEntry = {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
};

/** Граница ФС для walker (fake fs в тестах, прецедент ScanFs, ADR 0013). */
export interface CleanerFs {
  readdir(path: string): Promise<CleanerDirEntry[]>;
  stat(path: string): Promise<{ size: number; mtimeMs: number; isFile(): boolean }>;
}

export type UnavailableRoot = { root: string; code?: string };

export type CollectResult = {
  entries: RawCleanupEntry[];
  /** Каталоги с запретом чтения: помечены, обход продолжен (ADR 0013). */
  inaccessibleDirs: string[];
  /** Сами allow-корни не прочитаны: источник недоступен, причина — код ошибки (issue #56). */
  unavailableRoots: UnavailableRoot[];
};

function joinCleanerPath(dir: string, name: string): string {
  return dir.endsWith('\\') ? `${dir}${name}` : `${dir}\\${name}`;
}

/** Обход только allow-корней; Reparse Point никогда не обходятся. */
export async function collectCleanupCandidates(
  roots: readonly string[],
  fs: CleanerFs
): Promise<CollectResult> {
  const result: CollectResult = { entries: [], inaccessibleDirs: [], unavailableRoots: [] };
  for (const root of roots) {
    await walkRoot(root, fs, result, true);
  }
  return result;
}

async function walkRoot(
  dirPath: string,
  fs: CleanerFs,
  result: CollectResult,
  isRoot: boolean
): Promise<void> {
  let children: CleanerDirEntry[];
  try {
    children = await fs.readdir(dirPath);
  } catch (error) {
    if (isRoot) {
      result.unavailableRoots.push({ root: dirPath, code: errorCode(error) });
    } else {
      result.inaccessibleDirs.push(dirPath);
    }
    return;
  }
  for (const entry of children) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const full = joinCleanerPath(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walkRoot(full, fs, result, false);
    } else {
      const info = await fs.stat(full).then(
        (s) => (s.isFile() ? s : null),
        () => null
      );
      if (info) {
        result.entries.push({ path: full, sizeBytes: info.size, mtimeMs: info.mtimeMs });
      } else {
        // stat не удался или не файл: помечаем вместо молчаливого пропуска.
        result.entries.push({ path: full, sizeBytes: 0, inaccessible: true });
      }
    }
  }
}

/** Реальный node fs для Main (dirent-флаги: symlink/junction не обходятся). */
export const nodeCleanerFs: CleanerFs = {
  readdir: (path: string) => readdir(path, { withFileTypes: true }),
  stat: async (path: string) => {
    const info = await stat(path);
    return { size: info.size, mtimeMs: info.mtimeMs, isFile: () => info.isFile() };
  },
};
