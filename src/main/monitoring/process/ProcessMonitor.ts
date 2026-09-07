import type { ProcessSnapshot, ProcessEntry } from '@shared/ipc';
import { compareProcessEntryByCpuPid } from '@shared/processSort';
import { nonEmpty } from '../../util/math';
import { withFallback } from '../../util/promise';
import { classifyProtectedProcessName } from '../../system/processProtection';

export type ProcessRowSource = () => Promise<ProcessRow[]>;

export type ProcessRow = {
  ProcessId: number | null;
  Name: string | null;
  ExecutablePath: string | null;
  WorkingSetSize: number | null;
  UserModeTime: number | null;
  KernelModeTime: number | null;
  CommandLine: string | null;
  ThreadCount: number | null;
  CreationDate: string | null;
  ParentProcessId: number | null;
};

/** 0 = без ограничения: страница «Процессы» показывает полную таблицу (T2). */
const DEFAULT_MAX_PROCESSES = 0;

/**
 * Парсит CIM datetime (YYYYMMDDHHMMSS.mmmmmm±UUU) в epoch-ms. Возвращает null,
 * если значение отсутствует или не распознано (никогда не выдумывает — Unavailable).
 */
export function parseCimDateTime(value: string | null): number | null {
  if (!value) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.\d+([+-])(\d{3})$/.exec(value);
  if (!m) return null;
  const [, yy, mo, dd, hh, mi, ss, sign, offH] = m;
  const year = Number(yy);
  const month = Number(mo);
  const day = Number(dd);
  const hour = Number(hh);
  const minute = Number(mi);
  const second = Number(ss);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  // CIM-хвост ±UUU — смещение в минутах от UTC (напр. -300 = UTC-5).
  // Хранимое время локальное: UTC = local − offset.
  const offsetMinutes = Number(offH);
  return sign === '+' ? utc - offsetMinutes * 60_000 : utc + offsetMinutes * 60_000;
}

/** Мапит сырую WMI-строку процесса в контракт ProcessEntry (ADR 0011). */
export function toProcessEntry(row: ProcessRow, cpuPercent: number | null): ProcessEntry {
  return {
    pid: typeof row.ProcessId === 'number' ? row.ProcessId : 0,
    name: row.Name ?? 'unknown',
    cpuPercent,
    workingSetBytes: typeof row.WorkingSetSize === 'number' ? row.WorkingSetSize : 0,
    execPath: nonEmpty(row.ExecutablePath),
    protected: classifyProtectedProcessName(row.Name),
    commandLine: nonEmpty(row.CommandLine),
    threadCount: typeof row.ThreadCount === 'number' ? row.ThreadCount : 0,
    creationTime: parseCimDateTime(row.CreationDate),
    parentPid: typeof row.ParentProcessId === 'number' ? row.ParentProcessId : null,
  };
}

/**
 * Считает ProcessEntry с CPU% по дельте UserModeTime+KernelModeTime между двумя
 * сэмплами (ADR 0012). Возвращает только процессы, присутствующие в обоих
 * сэмплах: исчезнувшие и вновь запущенные не выдумывают CPU%. Регресс счётчиков
 * (сброс WMI — выход значений за пределы окна) отдаёт null (Unavailable), как
 * первый CPU Snapshot.
 */
export function toEntriesDelta(
  prevRows: ProcessRow[],
  curRows: ProcessRow[],
  elapsedMs: number
): ProcessEntry[] {
  const byPid = new Map<number, ProcessRow>();
  for (const row of curRows) {
    if (typeof row.ProcessId === 'number') byPid.set(row.ProcessId, row);
  }

  const elapsed = elapsedMs > 0 ? elapsedMs : 1;
  const entries: ProcessEntry[] = [];
  for (const prev of prevRows) {
    const cur = byPid.get(prev.ProcessId ?? -1);
    if (!cur) continue;
    const prevTicks = (prev.UserModeTime ?? 0) + (prev.KernelModeTime ?? 0);
    const curTicks = (cur.UserModeTime ?? 0) + (cur.KernelModeTime ?? 0);
    const ticksDelta = curTicks - prevTicks;
    let cpuPercent: number | null = (ticksDelta * 100) / (elapsed * 10_000);
    if (ticksDelta < 0 || !Number.isFinite(cpuPercent)) {
      cpuPercent = null;
    } else {
      cpuPercent = Math.round(cpuPercent * 10) / 10;
    }
    entries.push(toProcessEntry(cur, cpuPercent));
  }
  return entries;
}

async function readRawProcessRows(): Promise<ProcessRow[]> {
  if (process.platform !== 'win32') return [];
  const { runPowershellJson } = await import('../../system/ps');
  const rows = await runPowershellJson<ProcessRow[]>(
    `Get-CimInstance Win32_Process | Select-Object ProcessId,Name,ExecutablePath,WorkingSetSize,UserModeTime,KernelModeTime,CommandLine,ThreadCount,CreationDate,ParentProcessId | ConvertTo-Json -Compress`
  );
  return Array.isArray(rows) ? rows : [];
}

/**
 * Монитор процессов с кэшированным сэмплированием (ADR 0012): на каждом такте
 * один запрос источника, CPU% — дельта с предыдущим сэмплом. Первый сэмпл не
 * имеет предыдущего — CPU% отдаётся null (Unavailable, не выдумывается).
 */
export class ProcessMonitor {
  private readonly maxProcesses: number;
  private readonly source: ProcessRowSource;
  private prevRows: ProcessRow[] | null = null;
  private prevReadAtMs = 0;

  constructor(source: ProcessRowSource = readRawProcessRows, maxProcesses = DEFAULT_MAX_PROCESSES) {
    this.source = source;
    this.maxProcesses = maxProcesses;
  }

  async read(): Promise<ProcessSnapshot> {
    return withFallback(
      async () => {
        const curRows = await this.source();
        const now = Date.now();
        const prevRows = this.prevRows;
        const entries =
          prevRows === null
            ? curRows.map((row) => toProcessEntry(row, null))
            : toEntriesDelta(prevRows, curRows, now - this.prevReadAtMs);
        this.prevRows = curRows;
        this.prevReadAtMs = now;

        // детерминированная сортировка: cpuPercent desc, затем pid asc (ADR 0009)
        entries.sort(compareProcessEntryByCpuPid);

        return {
          timestamp: now,
          processes: this.maxProcesses > 0 ? entries.slice(0, this.maxProcesses) : entries,
        };
      },
      { timestamp: Date.now(), processes: [] }
    );
  }
}

export { DEFAULT_MAX_PROCESSES };
