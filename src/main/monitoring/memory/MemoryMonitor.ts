import { totalmem, freemem } from 'node:os';
import type { MemoryMetrics, SwapMetrics } from '@shared/ipc';
import { roundToTenth } from '../../util/math';

export type SwapSource = () => Promise<SwapMetrics | null>;

export type MemorySource = () => { total: number; available: number };

export function defaultMemorySource(): MemorySource {
  return () => ({ total: totalmem(), available: freemem() });
}

export type MemoryMonitorOptions = {
  memorySource?: MemorySource;
  swapSource?: SwapSource;
};

/**
 * Читает swap/pagefile из Win32_OperatingSystem (поля TotalVirtualMemorySize,
 * TotalVisibleMemorySize, FreeVirtualMemory, FreePhysicalMemory). При отсутствии
 * pagefile или некорректных значениях возвращает null (Unavailable, ADR 0009).
 */
export async function defaultSwapSource(): Promise<SwapMetrics | null> {
  if (process.platform !== 'win32') return null;
  const { runPowershellJson } = await import('../../system/ps');

  type OsRow = {
    TotalVirtualMemorySize: number | null;
    TotalVisibleMemorySize: number | null;
    FreeVirtualMemory: number | null;
    FreePhysicalMemory: number | null;
  };

  try {
    const [row] = await runPowershellJson<OsRow[]>(
      `Get-CimInstance Win32_OperatingSystem | Select-Object TotalVirtualMemorySize,TotalVisibleMemorySize,FreeVirtualMemory,FreePhysicalMemory | ConvertTo-Json -Compress`
    );
    const totalVirtual = valueInBytes(row.TotalVirtualMemorySize);
    const totalVisible = valueInBytes(row.TotalVisibleMemorySize);
    const freeVirtual = valueInBytes(row.FreeVirtualMemory);
    const freePhysical = valueInBytes(row.FreePhysicalMemory);

    if (totalVirtual === null || totalVisible === null) return null;
    const totalSwap = totalVirtual - totalVisible;
    if (totalSwap <= 0) return null;

    const usedSwap =
      freeVirtual !== null && freePhysical !== null
        ? totalSwap - (freeVirtual - freePhysical)
        : totalSwap;

    if (usedSwap < 0) return null;

    return {
      total: totalSwap,
      used: usedSwap,
      percent: roundToTenth((usedSwap / totalSwap) * 100),
    };
  } catch {
    return null;
  }
}

function valueInBytes(kb: number | null | undefined): number | null {
  if (typeof kb !== 'number' || !Number.isFinite(kb) || kb < 0) return null;
  // Win32_OperatingSystem возвращает килобайты
  return Math.round(kb * 1024);
}

export class MemoryMonitor {
  private readonly memorySource: MemorySource;
  private readonly swapSource: SwapSource;

  constructor(options: MemoryMonitorOptions = {}) {
    this.memorySource = options.memorySource ?? defaultMemorySource();
    this.swapSource = options.swapSource ?? defaultSwapSource;
  }

  read(): MemoryMetrics {
    const { total, available } = this.memorySource();
    // Некорректный total → полный Unavailable (null), не выдуманные 0 (ADR 0009)
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(available)) {
      return { total: null, used: null, available: null, percent: null, swap: null };
    }
    const used = Math.min(total, Math.max(0, total - available));
    const percent = roundToTenth((used / total) * 100);

    return { total, used, available, percent, swap: null };
  }

  async readMemoryWithSwap(): Promise<MemoryMetrics> {
    const base = this.read();
    const swap = await this.swapSource();
    return { ...base, swap };
  }
}
