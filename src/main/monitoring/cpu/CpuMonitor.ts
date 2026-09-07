import { cpus } from 'node:os';
import type { CpuInfoResponse, CpuUsageResponse } from '@shared/ipc';

export type CpuTickCore = {
  user: number;
  nice: number;
  sys: number;
  idle: number;
  irq: number;
};

export type CpuPhysicalCoresProvider = () => Promise<number | null>;

export type CpuSnapshot = {
  model: string;
  speedMhz: number;
  cores: CpuTickCore[];
};

export function readCpuSnapshotFromOs(): CpuSnapshot {
  const cores = cpus();
  return {
    model: cores[0]?.model ?? '',
    speedMhz: cores[0]?.speed ?? 0,
    cores: cores.map((c) => ({
      user: c.times.user,
      nice: c.times.nice,
      sys: c.times.sys,
      idle: c.times.idle,
      irq: c.times.irq,
    })),
  };
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function coreBusyTotal(core: CpuTickCore): number {
  return core.user + core.nice + core.sys + core.irq;
}

function coreTotal(core: CpuTickCore): number {
  return coreBusyTotal(core) + core.idle;
}

function deltas(current: CpuTickCore[], previous: CpuTickCore[]): (CpuTickCore | null)[] {
  return current.map((core, i) => {
    const prev = previous[i];
    if (!prev) return null;
    const delta = {
      user: core.user - prev.user,
      nice: core.nice - prev.nice,
      sys: core.sys - prev.sys,
      idle: core.idle - prev.idle,
      irq: core.irq - prev.irq,
    };
    if (delta.user < 0 || delta.nice < 0 || delta.sys < 0 || delta.idle < 0 || delta.irq < 0) {
      return null;
    }
    return delta;
  });
}

function utilizationFromDelta(delta: CpuTickCore): number | null {
  const total = coreTotal(delta);
  if (total <= 0) return null;
  return roundToTenth((coreBusyTotal(delta) / total) * 100);
}

export type CpuMonitorOptions = {
  tickSource?: () => CpuSnapshot;
  physicalCores?: CpuPhysicalCoresProvider;
};

export class CpuMonitor {
  private readonly tickSource: () => CpuSnapshot;
  private readonly physicalCoresProvider: CpuPhysicalCoresProvider;
  private previousSnapshot: CpuSnapshot | null = null;
  private infoCache: CpuInfoResponse | null = null;
  private physicalCoresPromise: Promise<number | null> | null = null;

  constructor(options: CpuMonitorOptions = {}) {
    this.tickSource = options.tickSource ?? readCpuSnapshotFromOs;
    this.physicalCoresProvider = options.physicalCores ?? defaultPhysicalCores;
  }

  getUsage(): CpuUsageResponse {
    const current = this.tickSource();
    const previous = this.previousSnapshot;

    if (!previous) {
      this.previousSnapshot = current;
      return {
        overall: null,
        perCore: current.cores.map(() => null),
        timestamp: Date.now(),
      };
    }

    this.previousSnapshot = current;
    const perCoreDelta = deltas(current.cores, previous.cores);
    const perCore = perCoreDelta.map((delta) =>
      delta === null ? null : utilizationFromDelta(delta)
    );

    let overall: number | null = null;
    const validDeltas = perCoreDelta.filter((delta): delta is CpuTickCore => delta !== null);
    if (validDeltas.length > 0) {
      const totalBusy = validDeltas.reduce((sum, core) => sum + coreBusyTotal(core), 0);
      const totalAll = validDeltas.reduce((sum, core) => sum + coreTotal(core), 0);
      if (totalAll > 0) overall = roundToTenth((totalBusy / totalAll) * 100);
    }

    return { overall, perCore, timestamp: Date.now() };
  }

  async getInfo(): Promise<CpuInfoResponse> {
    if (this.infoCache) return this.infoCache;

    const snapshot = this.tickSource();
    const physicalCores = await this.getPhysicalCores();

    const info: CpuInfoResponse = {
      model: snapshot.model,
      clockMhz: snapshot.speedMhz,
      logicalCores: snapshot.cores.length,
      physicalCores,
    };
    this.infoCache = info;
    return info;
  }

  private getPhysicalCores(): Promise<number | null> {
    if (!this.physicalCoresPromise) {
      this.physicalCoresPromise = this.physicalCoresProvider().catch(() => null);
    }
    return this.physicalCoresPromise;
  }
}

export async function defaultPhysicalCores(): Promise<number | null> {
  if (process.platform !== 'win32') return null;
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum',
      ],
      { timeout: 5000, windowsHide: true }
    );
    const parsed = Number(stdout.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}
