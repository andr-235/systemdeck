import { readdir, stat } from 'node:fs/promises';
import type {
  DirectoryNode,
  FileTypeCategory,
  FileTypeTotal,
  LargestFileEntry,
  ScanResult,
} from '@shared/ipc';
import { BoundedTopK } from '../util/topK';
import { classifyFileTypeCategory, FILE_TYPE_CATEGORIES } from './fileTypes';

/** Параллельность stat файлов в одном каталоге (чунками). */
export const MAX_FILE_STAT_CONCURRENCY = 16;

export const DEFAULT_MAX_LARGEST_FILES = 100;

export class ScanCancelledError extends Error {
  override name = 'ScanCancelledError';

  constructor() {
    super('Scan cancelled');
  }
}

/** Фиксированный том — буква диска с двоеточием ("C:"). */
export function isFixedVolumeId(volumeId: string): boolean {
  return /^[A-Za-z]:$/.test(volumeId);
}

/** Корневой путь тома с завершающим разделителем ("C:" -> "C:\\"). */
export function volumeRootPath(volumeId: string): string {
  if (!isFixedVolumeId(volumeId)) {
    throw new Error(`Invalid fixed-volume id: ${volumeId}`);
  }
  return `${volumeId}\\`;
}

export type ScanDirEntry = {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
};

export type ScanStats = {
  size: number;
  isFile(): boolean;
};

/** Системная граница обхода ФС — внедряется для тестов (fake fs, ADR 0013). */
export interface ScanFs {
  readdir(path: string): Promise<ScanDirEntry[]>;
  stat(path: string): Promise<ScanStats>;
}

export const nodeScanFs: ScanFs = {
  readdir: (path: string) => readdir(path, { withFileTypes: true }),
  stat: (path: string) => stat(path),
};

export type ScanProgress = {
  scannedEntries: number;
  scannedBytes: number;
  inaccessibleDirectories: number;
  currentPath: string;
};

export type ScanOptions = {
  maxLargestFiles?: number;
  statConcurrency?: number;
  isCancelled?: () => boolean;
  onProgress?: (progress: ScanProgress) => void;
};

export type ScanTreeResult = {
  tree: DirectoryNode;
  largestFiles: LargestFileEntry[];
  typeTotals: FileTypeTotal[];
  inaccessibleDirectories: number;
  scannedEntries: number;
  scannedBytes: number;
  totalBytes: number;
  fileCount: number;
};

type WalkState = {
  largestFiles: BoundedTopK<LargestFileEntry>;
  typeTotals: Map<FileTypeCategory, FileTypeTotal>;
  scannedEntries: number;
  scannedBytes: number;
  inaccessibleDirectories: number;
};

type ResolvedScanOptions = {
  maxLargestFiles: number;
  statConcurrency: number;
  isCancelled: () => boolean;
  onProgress: (progress: ScanProgress) => void;
};

function joinPath(dirPath: string, name: string): string {
  return dirPath.endsWith('\\') ? `${dirPath}${name}` : `${dirPath}\\${name}`;
}

function rootNodeName(rootPath: string): string {
  const withoutTrailing = rootPath.replace(/\\+$/, '');
  const slashIndex = withoutTrailing.lastIndexOf('\\');
  return slashIndex < 0 ? withoutTrailing : withoutTrailing.slice(slashIndex + 1);
}

async function walkDirectory(
  dirPath: string,
  dirName: string,
  fs: ScanFs,
  options: ResolvedScanOptions,
  state: WalkState,
  emitProgress: (currentPath: string) => void
): Promise<DirectoryNode> {
  if (options.isCancelled()) {
    throw new ScanCancelledError();
  }

  let entries: ScanDirEntry[];
  try {
    entries = await fs.readdir(dirPath);
  } catch {
    state.inaccessibleDirectories++;
    state.scannedEntries++;
    emitProgress(dirPath);
    return {
      name: dirName,
      path: dirPath,
      sizeBytes: 0,
      filesBytes: 0,
      fileCount: 0,
      inaccessible: true,
      children: [],
    };
  }

  state.scannedEntries += entries.length;

  // Reparse Point: никогда не обходим symlink/junction — размер цели не считаем, циклов нет (ADR 0013).
  const dirs = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink());
  const files = entries.filter(
    (entry) => !entry.isSymbolicLink() && (entry.isFile() || !entry.isDirectory())
  );

  let sizeBytes = 0;
  let filesBytes = 0;
  let fileCount = 0;

  for (let i = 0; i < files.length; i += options.statConcurrency) {
    if (options.isCancelled()) {
      throw new ScanCancelledError();
    }
    const chunk = files.slice(i, i + options.statConcurrency);
    const paths = chunk.map((entry) => joinPath(dirPath, entry.name));
    const stats = await Promise.all(paths.map((path) => fs.stat(path).catch(() => null)));
    for (let k = 0; k < chunk.length; k++) {
      const fileStats = stats[k];
      if (!fileStats || !fileStats.isFile()) {
        continue;
      }
      const fileSize = fileStats.size;
      const category = classifyFileTypeCategory(chunk[k].name);
      state.scannedBytes += fileSize;
      filesBytes += fileSize;
      fileCount++;
      state.largestFiles.add(fileSize, {
        path: paths[k],
        name: chunk[k].name,
        sizeBytes: fileSize,
        category,
      });
      const total = state.typeTotals.get(category);
      if (total) {
        total.sizeBytes += fileSize;
        total.fileCount += 1;
      }
    }
    emitProgress(dirPath);
  }

  const children: DirectoryNode[] = [];
  for (const subdir of [...dirs].sort((a, b) => a.name.localeCompare(b.name))) {
    if (options.isCancelled()) {
      throw new ScanCancelledError();
    }
    const childPath = joinPath(dirPath, subdir.name);
    const child = await walkDirectory(childPath, subdir.name, fs, options, state, emitProgress);
    const childSize = child.sizeBytes;
    sizeBytes += childSize;
    fileCount += child.fileCount;
    children.push(child);
  }
  children.sort((a, b) => b.sizeBytes - a.sizeBytes);

  return {
    name: dirName,
    path: dirPath,
    sizeBytes: filesBytes + sizeBytes,
    filesBytes,
    fileCount,
    inaccessible: false,
    children,
  };
}

const defaultOptions: ResolvedScanOptions = {
  maxLargestFiles: DEFAULT_MAX_LARGEST_FILES,
  statConcurrency: MAX_FILE_STAT_CONCURRENCY,
  isCancelled: () => false,
  onProgress: () => {
    /* noop */
  },
};

export async function scanTree(
  rootPath: string,
  fs: ScanFs,
  options: ScanOptions = {}
): Promise<ScanTreeResult> {
  const resolved: ResolvedScanOptions = { ...defaultOptions, ...options };
  const state: WalkState = {
    largestFiles: new BoundedTopK<LargestFileEntry>(resolved.maxLargestFiles),
    typeTotals: new Map(
      FILE_TYPE_CATEGORIES.map((category) => [
        category,
        { category, sizeBytes: 0, fileCount: 0 },
      ])
    ),
    scannedEntries: 0,
    scannedBytes: 0,
    inaccessibleDirectories: 0,
  };
  const emitProgress = (currentPath: string): void => {
    resolved.onProgress({
      scannedEntries: state.scannedEntries,
      scannedBytes: state.scannedBytes,
      inaccessibleDirectories: state.inaccessibleDirectories,
      currentPath,
    });
  };

  const tree = await walkDirectory(
    rootPath,
    rootNodeName(rootPath),
    fs,
    resolved,
    state,
    emitProgress
  );

  return {
    tree,
    largestFiles: state.largestFiles.snapshot(),
    typeTotals: [...state.typeTotals.values()],
    inaccessibleDirectories: state.inaccessibleDirectories,
    scannedEntries: state.scannedEntries,
    scannedBytes: state.scannedBytes,
    totalBytes: tree.sizeBytes,
    fileCount: tree.fileCount,
  };
}

export async function runScan(
  volumeId: string,
  fs: ScanFs,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const start = performance.now();
  const rootPath = volumeRootPath(volumeId);
  const result = await scanTree(rootPath, fs, options);
  return {
    volumeId,
    timestamp: Date.now(),
    durationMs: Math.round(performance.now() - start),
    totalBytes: result.totalBytes,
    fileCount: result.fileCount,
    inaccessibleDirectories: result.inaccessibleDirectories,
    tree: result.tree,
    largestFiles: result.largestFiles,
    typeTotals: result.typeTotals,
  };
}