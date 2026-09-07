import type { ProcessSnapshot, ProcessEntry } from '@shared/ipc';
import { nonEmpty } from '../../util/math';
import { withFallback } from '../../util/promise';

export type ProcessSource = () => Promise<ProcessEntry[]>;

type ProcessRow = {
  ProcessId: number | null;
  Name: string | null;
  ExecutablePath: string | null;
  WorkingSetSize: number | null;
  UserModeTime: number | null;
  KernelModeTime: number | null;
};

const DEFAULT_MAX_PROCESSES = 200;

async function readRawProcessRows(): Promise<ProcessRow[]> {
  if (process.platform !== 'win32') return [];
  const { runPowershellJson } = await import('../../system/ps');
  const rows = await runPowershellJson<ProcessRow[]>(
    `Get-CimInstance Win32_Process | Select-Object ProcessId,Name,ExecutablePath,WorkingSetSize,UserModeTime,KernelModeTime | ConvertTo-Json -Compress`
  );
  return Array.isArray(rows) ? rows : [];
}

export async function readProcesses(): Promise<ProcessEntry[]> {
  const rows = await readRawProcessRows();
  return rows.map((row) => ({
    pid: typeof row.ProcessId === 'number' ? row.ProcessId : 0,
    name: row.Name ?? 'unknown',
    cpuPercent: 0,
    memBytes: typeof row.WorkingSetSize === 'number' ? row.WorkingSetSize : 0,
    execPath: nonEmpty(row.ExecutablePath),
  }));
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
    entries.push({
      pid: cur.ProcessId ?? 0,
      name: cur.Name ?? 'unknown',
      cpuPercent: Math.round(cpuPercent * 10) / 10,
      memBytes: cur.WorkingSetSize ?? 0,
      execPath: nonEmpty(cur.ExecutablePath),
    });
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
