import type { TemperatureEntry } from '@shared/ipc';

export type TemperatureSource = () => Promise<TemperatureEntry[]>;

type ThermalZoneRow = {
  Name: string | null;
  CurrentTemperature: number | null;
};

/**
 * Probe источника температуры через WMI MSAcpi_ThermalZoneTemperature.
 * Требует прав администратора и наличия ACPI тепловых зон; при недоступности
 * должен вернуть пустой массив, никогда не выдумывая значения (ADR 0009).
 */
async function readThermalZones(): Promise<TemperatureEntry[]> {
  if (process.platform !== 'win32') return [];
  const { runPowershellJson } = await import('../../system/ps');
  const rows = await runPowershellJson<ThermalZoneRow[]>(
    `Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature | Select-Object Name,CurrentTemperature | ConvertTo-Json -Compress`
  );
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const tenthsKelvin =
        typeof row.CurrentTemperature === 'number' ? row.CurrentTemperature : null;
      if (tenthsKelvin === null || !Number.isFinite(tenthsKelvin)) return null;
      // MSAcpi возвращает температуры в десятых долях кельвина: (k - 2732) / 10 → Цельсий
      const valueC = Math.round((tenthsKelvin - 2732) / 10);
      return { sensor: row.Name ?? 'thermal-zone', valueC };
    })
    .filter((t): t is TemperatureEntry => t !== null);
}

export class TemperatureMonitor {
  private readonly source: TemperatureSource;
  private cached: TemperatureEntry[] | null = null;

  constructor(source: TemperatureSource = readThermalZones) {
    this.source = source;
  }

  /**
   * Eager-probe источника температуры при старте Main (ADR 0009). Вызывается один
   * раз; результат кэшируется на сессию. Ошибки/пустота → пустой массив.
   */
  async probe(): Promise<TemperatureEntry[]> {
    if (this.cached !== null) return this.cached;
    try {
      this.cached = await this.source();
    } catch {
      this.cached = [];
    }
    return this.cached;
  }

  /**
   * Живое значение на такте Main: возвращает кэш probe. Если probe ещё не
   * запущен (например, планировщик стартовал до Main) — запускает лениво.
   */
  async getLive(): Promise<TemperatureEntry[]> {
    return this.probe();
  }
}
