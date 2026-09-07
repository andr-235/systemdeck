import type { NetworkInterfaceMetrics } from '@shared/ipc';
import { withFallback } from '../../util/promise';

export type NetworkSource = () => Promise<NetworkInterfaceMetrics[]>;

type CounterRow = {
  Timestamp?: string;
  Path: string | null;
  InstanceName: string | null;
  Value: number | null;
};

/**
 * Read rate-счётчиков PDH `Network Interface` через Get-Counter.
 * Возвращает JSON вида [{ Timestamp, InstanceName, Value }] на оба каунтера.
 */
async function readNetworkCounters(): Promise<CounterRow[]> {
  const { runPowershell } = await import('../../system/ps');
  const stdout = await runPowershell(
    `$samples = Get-Counter '\\Network Interface(*)\\Bytes Received/sec' -ErrorAction SilentlyContinue |
      ForEach-Object { $_.CounterSamples | ForEach-Object {
        [pscustomobject]@{ Path = $_.Path; InstanceName = $_.InstanceName; Value = $_.CookedValue }
      } };
      $sent = Get-Counter '\\Network Interface(*)\\Bytes Sent/sec' -ErrorAction SilentlyContinue |
      ForEach-Object { $_.CounterSamples | ForEach-Object {
        [pscustomobject]@{ Path = $_.Path; InstanceName = $_.InstanceName; Value = $_.CookedValue }
      } };
      ($samples + $sent) | ConvertTo-Json -Compress`
  );
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as CounterRow[];
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Чистая агрегация сырых строк счётчиков в активные адаптеры: rx/tx байт/с по
 * инстансу PDH. Виртуальные/неактивные адаптеры с суммарной активностью ~0
 * скрываются (ADR 0009).
 */
export function aggregateNetworkCounters(rows: CounterRow[]): NetworkInterfaceMetrics[] {
  const byInstance = new Map<string, { rx: number; tx: number }>();

  for (const row of rows) {
    if (!row.InstanceName) continue;
    const value = typeof row.Value === 'number' && Number.isFinite(row.Value) ? row.Value : 0;
    const entry = byInstance.get(row.InstanceName) ?? { rx: 0, tx: 0 };
    if (row.Path?.includes('Bytes Received')) {
      entry.rx = value;
    } else if (row.Path?.includes('Bytes Sent')) {
      entry.tx = value;
    }
    byInstance.set(row.InstanceName, entry);
  }

  const result: NetworkInterfaceMetrics[] = [];
  for (const [id, { rx, tx }] of byInstance) {
    if (rx <= 0 && tx <= 0) continue;
    result.push({ id, name: id, rxBytesPerSec: rx, txBytesPerSec: tx });
  }
  return result;
}

/**
 * Собирает активные адаптеры из rate-счётчиков PDH Network Interface.
 */
export async function defaultNetworkSource(): Promise<NetworkInterfaceMetrics[]> {
  if (process.platform !== 'win32') return [];
  const rows = await readNetworkCounters();
  return aggregateNetworkCounters(rows);
}

export class NetworkMonitor {
  private readonly source: NetworkSource;

  constructor(source: NetworkSource = defaultNetworkSource) {
    this.source = source;
  }

  async read(): Promise<NetworkInterfaceMetrics[]> {
    return withFallback(this.source, []);
  }
}
