import type { ProcessEntry, ProcessSnapshot } from '@shared/ipc';

export type ProcessSortKey = 'pid' | 'name' | 'cpuPercent' | 'workingSetBytes';
export type ProcessSortDir = 'asc' | 'desc';

export type ProcessGroup = {
  key: string;
  name: string;
  execPath: string | null;
  /** Первый процесс группы (ядро для feedback: PID группы = pid первого члена). */
  pid: number;
  processes: ProcessEntry[];
  cpuPercent: number | null;
  workingSetBytes: number;
  protected: boolean;
};

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
    // cpuPercent: null (Unavailable) трактуется как -1 — прочерки в конце desc
    const va = key === 'cpuPercent' ? (a.cpuPercent ?? -1) : a[key];
    const vb = key === 'cpuPercent' ? (b.cpuPercent ?? -1) : b[key];
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * factor;
    }
    return String(va).localeCompare(String(vb)) * factor;
  });
}

/**
 * Группирует процессы по исполняемому файлу (fallback — по имени, когда
 * `execPath` недоступен без прав) с агрегацией CPU/Working Set и флагом
 * защищённости группы, если хотя бы один процесс в ней protected (EPIC 3).
 * CPU% группы — сумма не-null членов, округлённая до 0.1; если ни у одного
 * члена нет CPU% (все Unavailable), агрегат тоже null.
 */
export function groupProcesses(entries: ProcessEntry[]): ProcessGroup[] {
  const byKey = new Map<string, ProcessGroup>();
  for (const p of entries) {
    const key = p.execPath ?? p.name;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        name: p.name,
        execPath: p.execPath,
        pid: p.pid,
        processes: [],
        cpuPercent: 0,
        workingSetBytes: 0,
        protected: false,
      };
      byKey.set(key, group);
    }
    group.processes.push(p);
    group.workingSetBytes += p.workingSetBytes;
    if (p.protected) group.protected = true;
  }
  const groups = [...byKey.values()];
  for (const g of groups) {
    const sum = g.processes.reduce((acc, p) => acc + (p.cpuPercent ?? 0), 0);
    const anyKnown = g.processes.some((p) => p.cpuPercent !== null);
    g.cpuPercent = anyKnown ? Math.round(sum * 10) / 10 : null;
  }
  return groups;
}

/** Сортирует группы приложений; для `pid` берётся pid группы (первый член). */
export function sortGroups(
  groups: ProcessGroup[],
  key: ProcessSortKey,
  dir: ProcessSortDir
): ProcessGroup[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...groups].sort((a, b) => {
    const va = key === 'pid' ? a.pid : key === 'cpuPercent' ? (a.cpuPercent ?? -1) : a[key];
    const vb = key === 'pid' ? b.pid : key === 'cpuPercent' ? (b.cpuPercent ?? -1) : b[key];
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
    return String(va).localeCompare(String(vb)) * factor;
  });
}
