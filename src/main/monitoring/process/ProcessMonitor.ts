import type { ProcessSnapshot, ProcessEntry } from '@shared/ipc';
import { nonEmpty } from '../../util/math';
import { withFallback } from '../../util/promise';
import { classifyProtectedProcessName } from '../../system/processProtection';

export type ProcessSource = () => Promise<ProcessEntry[]>;

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
export function toProcessEntry(row: ProcessRow, cpuPercent: number): ProcessEntry {
  return {
    pid: typeof row.ProcessId === 'number' ? row.ProcessId : 0,
    name: row.Name ?? 'unknown',
    cpuPercent,
    memBytes: typeof row.WorkingSetSize === 'number' ? row.WorkingSetSize : 0,
    execPath: nonEmpty(row.ExecutablePath),
    protected: classifyProtectedProcessName(row.Name),
    commandLine: nonEmpty(row.CommandLine),
    threadCount: typeof row.ThreadCount === 'number' ? row.ThreadCount : 0,
    creationTime: parseCimDateTime(row.CreationDate),
    parentPid: typeof row.ParentProcessId === 'number' ? row.ParentProcessId : null,
  };
}

async function readRawProcessRows(): Promise<ProcessRow[]> {
  if (process.platform !== 'win32') return [];
  const { runPowershellJson } = await import('../../system/ps');
  const rows = await runPowershellJson<ProcessRow[]>(
    `Get-CimInstance Win32_Process | Select-Object ProcessId,Name,ExecutablePath,WorkingSetSize,UserModeTime,KernelModeTime,CommandLine,ThreadCount,CreationDate,ParentProcessId | ConvertTo-Json -Compress`
  );
  return Array.isArray(rows) ? rows : [];
}

export async function readProcesses(): Promise<ProcessEntry[]> {
  const rows = await readRawProcessRows();
  return rows.map((row) => toProcessEntry(row, 0));
}

/**
 * Считает CPU% каждого процесса по дельте UserModeTime+KernelModeTime между двумя
 * сэмплами с паузой sampleGapMs. Возвращает ProcessSnapshot с timestamp.
 */
export async function sampleProcesses(
  sampleGapMs: number,
  maxProcesses: number
): Promise<{ timestamp: number; processes: ProcessEntry[] }> {
  const { sleep } = await import('../../util/sleep');

  const before = await readRawProcessRows();
  await sleep(sampleGapMs);
  const after = await readRawProcessRows();

  const byPid = new Map<number, ProcessRow>();
  for (const row of after) {
    if (row.ProcessId !== null) byPid.set(row.ProcessId, row);
  }

  const entries: ProcessEntry[] = [];
  const elapsedMs = sampleGapMs > 0 ? sampleGapMs : 1;

  for (const prev of before) {
    const cur = byPid.get(prev.ProcessId ?? -1);
    if (!cur) continue;
    const prevCpu = (prev.UserModeTime ?? 0) + (prev.KernelModeTime ?? 0);
    const curCpu = (cur.UserModeTime ?? 0) + (cur.KernelModeTime ?? 0);
    const cpuDelta = Math.max(0, curCpu - prevCpu);
    // UserModeTime+KernelModeTime в 100ns; процент доли ядра в окне:
    // cpuDelta * 100ns / elapsedMs
    const cpuPercent = (cpuDelta * 100) / (elapsedMs * 10_000);
    entries.push(toProcessEntry(cur, Math.round(cpuPercent * 10) / 10));
  }

  // детерминированная сортировка: cpuPercent desc, затем pid asc (ADR 0009)
  entries.sort((a, b) => b.cpuPercent - a.cpuPercent || a.pid - b.pid);

  return {
    timestamp: Date.now(),
    processes: maxProcesses > 0 ? entries.slice(0, maxProcesses) : entries,
  };
}

export class ProcessMonitor {
  private readonly sampleGapMs: number;
  private readonly maxProcesses: number;

  constructor(sampleGapMs = 1000, maxProcesses = DEFAULT_MAX_PROCESSES) {
    this.sampleGapMs = sampleGapMs;
    this.maxProcesses = maxProcesses;
  }

  async read(): Promise<ProcessSnapshot> {
    return withFallback(() => sampleProcesses(this.sampleGapMs, this.maxProcesses), {
      timestamp: Date.now(),
      processes: [],
    });
  }
}

export { DEFAULT_MAX_PROCESSES };
