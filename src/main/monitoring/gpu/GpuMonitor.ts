import type { GpuInfoAdapter, GpuInfoResponse, GpuUtilizationEntry } from '@shared/ipc';
import { finiteNonNeg, nonEmpty } from '../../util/math';
import { withFallback } from '../../util/promise';

export type GpuInfoSource = () => Promise<GpuInfoAdapter[]>;
export type GpuUtilSource = () => Promise<GpuUtilizationEntry[]>;

type VideoControllerRow = {
  Name: string | null;
  AdapterCompatibility: string | null;
  AdapterRAM: number | null;
  DriverVersion: string | null;
};

async function readVideoControllers(): Promise<GpuInfoAdapter[]> {
  const { runPowershellJson } = await import('../../system/ps');
  const rows = await runPowershellJson<VideoControllerRow[]>(
    `Get-CimInstance Win32_VideoController | Select-Object Name,AdapterCompatibility,AdapterRAM,DriverVersion | ConvertTo-Json -Compress`
  );
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    name: row.Name ?? 'Unknown GPU',
    vendor: nonEmpty(row.AdapterCompatibility),
    dedicatedMemoryBytes: finiteNonNeg(row.AdapterRAM),
    sharedMemoryBytes: null,
    driverVersion: nonEmpty(row.DriverVersion),
  }));
}

export async function defaultGpuInfoSource(): Promise<GpuInfoAdapter[]> {
  if (process.platform !== 'win32') return [];
  return withFallback(readVideoControllers, []);
}

export type GpuEngineSample = { InstanceName: string | null; Value: number | null };

function luidKeyOf(instanceName: string | null): string | null {
  if (!instanceName) return null;
  const match = /luid_(0x[0-9a-fA-F]+)_(0x[0-9a-fA-F]+)_phys_0/.exec(instanceName);
  if (!match) return null;
  return `${match[1].toLowerCase()}_${match[2].toLowerCase()}`;
}

/**
 * Максимум по движкам физического адаптера, сгруппированный по LUID инстанса
 * `GPU Engine` (SD-014): одна запись на адаптер, порядок — по возрастанию LUID,
 * тот же, что нумерация GPU в PDH/Task Manager. Нефизические (virtualized)
 * движки отбрасываются.
 */
export function aggregateGpuUtilSamples(samples: GpuEngineSample[]): GpuUtilizationEntry[] {
  const byLuid = new Map<string, number>();
  for (const sample of samples) {
    const key = luidKeyOf(sample.InstanceName);
    if (key === null) continue;
    const value =
      typeof sample.Value === 'number' && Number.isFinite(sample.Value) ? sample.Value : 0;
    byLuid.set(key, Math.max(byLuid.get(key) ?? 0, value));
  }
  const keys = [...byLuid.keys()].sort();
  if (keys.length === 0) return [{ utilization: null }];
  return keys.map((key) => ({
    utilization: Math.round((byLuid.get(key) as number) * 10) / 10,
  }));
}

/**
 * Живая утилизация GPU из perf-каунтера PDH `GPU Engine` (Utilization Percentage).
 * Counter уже rate-типа: PDH сам считает дельту двух своих сэмплов raw-каунтера
 * и отдаёт CookedValue (процент занятости движка) — отдельного вычитания не требуется.
 * Инстансы счётчика не несут тип движка (3D/Copy/...), поэтому по адаптеру берётся
 * максимум по движкам — то, что реально показывает работу GPU (ADR 0009).
 * При недоступности счётчиков (нет WDDM 2.x, VM) — записи с utilization: null
 * (Unavailable, не падение).
 */
export async function defaultGpuUtilSource(): Promise<GpuUtilizationEntry[]> {
  if (process.platform !== 'win32') return [];
  const { runPowershell } = await import('../../system/ps');
  try {
    const stdout = await runPowershell(
      `$samples = Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction SilentlyContinue |
        ForEach-Object { $_.CounterSamples | ForEach-Object {
          [pscustomobject]@{ InstanceName = $_.InstanceName; Value = $_.CookedValue }
        } };
      $samples | ConvertTo-Json -Compress`
    );
    const trimmed = stdout.trim();
    if (!trimmed) return [{ utilization: null }];
    const parsed = JSON.parse(trimmed) as unknown;
    const rows = Array.isArray(parsed) ? (parsed as GpuEngineSample[]) : [];
    return aggregateGpuUtilSamples(rows);
  } catch {
    return [{ utilization: null }];
  }
}

export class GpuMonitor {
  private readonly infoSource: GpuInfoSource;
  private readonly utilSource: GpuUtilSource;
  private infoCache: GpuInfoResponse | null = null;
  private warmed = false;

  constructor(
    infoSource: GpuInfoSource = defaultGpuInfoSource,
    utilSource: GpuUtilSource = defaultGpuUtilSource
  ) {
    this.infoSource = infoSource;
    this.utilSource = utilSource;
  }

  async getInfo(): Promise<GpuInfoResponse> {
    if (this.infoCache) return this.infoCache;
    const adapters = await this.infoSource();
    this.infoCache = { adapters };
    return this.infoCache;
  }

  /**
   * Живое значение GPU util на такте Main (ADR 0008): два сэмпла — предыдущий
   * такт и текущий. Первый такт — только warmup: возвращаем Unavailable (null),
   * как CpuMonitor; со второго такта возвращается дельта окна (текущий CookedValue).
   */
  async getLive(): Promise<GpuUtilizationEntry[]> {
    const current = await this.utilSource();
    if (!this.warmed) {
      this.warmed = true;
      return current.map(() => ({ utilization: null }));
    }
    return current;
  }
}
