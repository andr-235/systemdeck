import { hostname, arch, uptime } from 'node:os';
import type { SystemInfoResponse } from '@shared/ipc';
import { nonEmpty } from '../../util/math';

export type SystemInfoSource = () => Promise<
  Omit<SystemInfoResponse, 'hostname' | 'uptimeSeconds' | 'arch'>
>;

type ComputerSystemRow = {
  Manufacturer: string | null;
  Model: string | null;
};

type BaseBoardRow = {
  Manufacturer: string | null;
  Product: string | null;
};

type OperatingSystemRow = {
  Caption: string | null;
  Version: string | null;
  BuildNumber: string | null;
  TotalVisibleMemorySize: number | null;
};

async function readStaticSystem(): Promise<
  Omit<SystemInfoResponse, 'hostname' | 'uptimeSeconds' | 'arch'>
> {
  if (process.platform !== 'win32') {
    return {
      osName: process.platform,
      osVersion: '',
      osBuild: '',
      manufacturer: null,
      systemModel: null,
      motherboardManufacturer: null,
      motherboardProduct: null,
      installedRamBytes: null,
    };
  }
  const { runPowershellJson } = await import('../../system/ps');
  const osRows = await runPowershellJson<OperatingSystemRow[]>(
    `Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,TotalVisibleMemorySize | ConvertTo-Json -Compress`
  );
  const osRow = osRows[0];
  const csRows = await runPowershellJson<ComputerSystemRow[]>(
    `Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model | ConvertTo-Json -Compress`
  );
  const csRow = csRows[0];
  const bbRows = await runPowershellJson<BaseBoardRow[]>(
    `Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer,Product | ConvertTo-Json -Compress`
  );
  const bbRow = bbRows[0];

  return {
    osName: nonEmpty(osRow?.Caption) ?? 'Windows',
    osVersion: nonEmpty(osRow?.Version) ?? '',
    osBuild: nonEmpty(osRow?.BuildNumber) ?? '',
    manufacturer: nonEmpty(csRow?.Manufacturer),
    systemModel: nonEmpty(csRow?.Model),
    motherboardManufacturer: nonEmpty(bbRow?.Manufacturer),
    motherboardProduct: nonEmpty(bbRow?.Product),
    installedRamBytes:
      typeof osRow?.TotalVisibleMemorySize === 'number' && osRow.TotalVisibleMemorySize > 0
        ? Math.round(osRow.TotalVisibleMemorySize * 1024)
        : null,
  };
}

export class SystemInfoMonitor {
  private readonly source: SystemInfoSource;
  private cache: SystemInfoResponse | null = null;

  constructor(source: SystemInfoSource = readStaticSystem) {
    this.source = source;
  }

  async getInfo(): Promise<SystemInfoResponse> {
    if (this.cache) return this.cache;
    const staticInfo = await this.source();
    this.cache = {
      ...staticInfo,
      hostname: hostname(),
      uptimeSeconds: Math.floor(uptime()),
      arch: arch(),
    };
    return this.cache;
  }
}
