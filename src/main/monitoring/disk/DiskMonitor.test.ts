import { describe, it, expect } from 'vitest';
import { DiskMonitor, type DiskSource } from './DiskMonitor';
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
});
