import type { DiskVolumeMetrics } from '@shared/ipc';
import { percentFrom, finiteNonNeg, nonEmpty } from '../../util/math';
import { withFallback } from '../../util/promise';

export type DiskSource = () => Promise<DiskVolumeMetrics[]>;

type LogicalDiskRow = {
  DeviceID: string | null;
  Size: number | null;
  FreeSpace: number | null;
  FileSystem: string | null;
  VolumeName: string | null;
};

/**
 * WMI Win32_LogicalDisk, только фиксированные тома (DriveType = 3).
 * Removable/сетевые/оптические (DriveType 2/4/5/6) в v0.1 не показываются (ADR 0009).
 */
export async function defaultDiskSource(): Promise<DiskVolumeMetrics[]> {
  if (process.platform !== 'win32') return [];
  const { runPowershellJson } = await import('../../system/ps');

  const rows = await runPowershellJson<LogicalDiskRow[]>(
    `Get-CimInstance Win32_LogicalDisk -Filter "DriveType = 3" | Select-Object DeviceID,Size,FreeSpace,FileSystem,VolumeName | ConvertTo-Json -Compress`
  );

  return rows
    .map((row) => {
      const total = finiteNonNeg(row.Size);
      if (total === null) return null;
      const free = finiteNonNeg(row.FreeSpace);
      // free может быть недоступен (нет прав/метаданных): не выдумываем 0
      // и не считаем «занято» (ADR 0009 — Unavailable, а не guess).
      const used = free === null ? null : Math.max(0, total - free);
      return {
        id: row.DeviceID ?? 'unknown',
        name: nonEmpty(row.VolumeName),
        fileSystem: nonEmpty(row.FileSystem),
        total,
        used,
        free,
        percent: used === null ? null : percentFrom(total, used),
      };
    })
    .filter((d): d is DiskVolumeMetrics => d !== null);
}

export class DiskMonitor {
  private readonly source: DiskSource;

  constructor(source: DiskSource = defaultDiskSource) {
    this.source = source;
  }

  async read(): Promise<DiskVolumeMetrics[]> {
    return withFallback(this.source, []);
  }
}
