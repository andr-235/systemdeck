import type { ProcessEntry, ProcessSnapshot } from '@shared/ipc';

export type ProcessSortKey = 'pid' | 'name' | 'cpuPercent' | 'memBytes';
export type ProcessSortDir = 'asc' | 'desc';

/** Ищет процесс в снимке по маске выбора PID (скрывает навигацию в снapshot у вызывающего). */
export function findProcessById(
  snapshot: ProcessSnapshot | null,
  pid: number | null
): ProcessEntry | null {
  if (snapshot === null || pid === null) return null;
  return snapshot.processes.find((p) => p.pid === pid) ?? null;
}

export function filterProcesses(entries: ProcessEntry[], query: string): ProcessEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((p) => p.name.toLowerCase().includes(q) || String(p.pid).includes(q));
}

export function sortProcesses(
  entries: ProcessEntry[],
  key: ProcessSortKey,
  dir: ProcessSortDir
): ProcessEntry[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * factor;
    }
    return String(va).localeCompare(String(vb)) * factor;
  });
}
