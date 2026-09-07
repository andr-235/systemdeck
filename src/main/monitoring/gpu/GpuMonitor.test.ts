import { describe, it, expect } from 'vitest';
import { GpuMonitor, aggregateGpuUtilSamples, type GpuEngineSample } from './GpuMonitor';
import type { GpuUtilizationEntry } from '@shared/ipc';

const samples: GpuEngineSample[] = [
  { InstanceName: 'pid_123_luid_0x00000000_0x0000582F_phys_0_eng_0_engtype_3D', Value: 40 },
  { InstanceName: 'pid_123_luid_0x00000000_0x0000582F_phys_0_eng_1_engtype_Compute', Value: 70.34 },
  { InstanceName: 'pid_9_luid_0x00000000_0x00007896_phys_0_eng_0_engtype_3D', Value: 12.34 },
  { InstanceName: 'pid_9_luid_0x00000000_0x00007896_phys_0_eng_2_engtype_Copy', Value: 15.678 },
  // виртуальные движки (virtualized) и сломанные инстансы отбрасываются
  { InstanceName: 'pid_9_luid_0x00000000_0x0000582F_virtualized_0_eng_0_engtype_3D', Value: 99 },
  { InstanceName: 'garbage', Value: 42 },
];

describe('GpuMonitor (node project)', () => {
  it('aggregates engine samples per physical adapter by LUID order, taking max', () => {
    expect(aggregateGpuUtilSamples(samples)).toEqual([
      { utilization: 70.3 },
      { utilization: 15.7 },
    ]);
  });

  it('returns a single Unavailable entry when no physical engine matches', () => {
    expect(
      aggregateGpuUtilSamples([
        { InstanceName: 'luid_0x00000000_0x0000582F_virtualized_0', Value: 10 },
      ])
    ).toEqual([{ utilization: null }]);
    expect(aggregateGpuUtilSamples([])).toEqual([{ utilization: null }]);
  });

  it('treats non-finite values as 0 without crashing', () => {
    expect(
      aggregateGpuUtilSamples([
        { InstanceName: 'pid_1_luid_0x00000000_0x0000582F_phys_0_eng_0_engtype_3D', Value: null },
        { InstanceName: 'pid_1_luid_0x00000000_0x0000582F_phys_0_eng_1_engtype_Copy', Value: 100 },
      ])
    ).toEqual([{ utilization: 100 }]);
  });

  it('warmup tick returns Unavailable, next tick returns the current sample', async () => {
    const utilSource = async (): Promise<GpuUtilizationEntry[]> => [{ utilization: 55.5 }];
    const monitor = new GpuMonitor(async () => [], utilSource);

    await expect(monitor.getLive()).resolves.toEqual([{ utilization: null }]);
    await expect(monitor.getLive()).resolves.toEqual([{ utilization: 55.5 }]);
  });
});
