import { describe, it, expect } from 'vitest';
import { DiskMonitor, toDiskVolumes, type DiskSource } from './DiskMonitor';
import type { DiskVolumeMetrics } from '@shared/ipc';

const volumes: DiskVolumeMetrics[] = [
  {
    id: 'C:',
    name: 'System',
    fileSystem: 'NTFS',
    total: 500_000_000,
    used: 300_000_000,
    free: 200_000_000,
    percent: 60,
  },
];

describe('DiskMonitor (node project)', () => {
  it('read returns volumes from the source', async () => {
    const source: DiskSource = async () => volumes;
    const monitor = new DiskMonitor(source);
    await expect(monitor.read()).resolves.toEqual(volumes);
  });

  it('read yields empty array when source fails (no crash)', async () => {
    const source: DiskSource = async () => {
      throw new Error('wmi boom');
    };
    const monitor = new DiskMonitor(source);
    await expect(monitor.read()).resolves.toEqual([]);
  });

  it('toDiskVolumes оборачивает одиночный объект (один том C:) в массив', () => {
    expect(
      toDiskVolumes({
        DeviceID: 'C:',
        Size: 239934107648,
        FreeSpace: 150066184192,
        FileSystem: 'NTFS',
        VolumeName: '',
      })
    ).toEqual([
      {
        id: 'C:',
        name: null,
        fileSystem: 'NTFS',
        total: 239934107648,
        used: 89867923456,
        free: 150066184192,
        percent: 37.5,
      },
    ]);
  });

  it('toDiskVolumes маппит массив строк как раньше', () => {
    expect(
      toDiskVolumes([
        { DeviceID: 'C:', Size: 1000, FreeSpace: 400, FileSystem: 'NTFS', VolumeName: 'System' },
        { DeviceID: 'D:', Size: 2000, FreeSpace: 1900, FileSystem: 'NTFS', VolumeName: 'Data' },
      ])
    ).toEqual([
      {
        id: 'C:',
        name: 'System',
        fileSystem: 'NTFS',
        total: 1000,
        used: 600,
        free: 400,
        percent: 60,
      },
      {
        id: 'D:',
        name: 'Data',
        fileSystem: 'NTFS',
        total: 2000,
        used: 100,
        free: 1900,
        percent: 5,
      },
    ]);
  });

  it('toDiskVolumes возвращает [] для null, undefined и пустого массива', () => {
    expect(toDiskVolumes(null)).toEqual([]);
    expect(toDiskVolumes(undefined)).toEqual([]);
    expect(toDiskVolumes([])).toEqual([]);
  });
});
