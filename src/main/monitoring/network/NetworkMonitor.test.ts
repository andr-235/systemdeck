import { describe, it, expect } from 'vitest';
import { NetworkMonitor, aggregateNetworkCounters, type NetworkSource } from './NetworkMonitor';
import type { NetworkInterfaceMetrics } from '@shared/ipc';

const active: NetworkInterfaceMetrics[] = [
  { id: 'Ethernet', name: 'Ethernet', rxBytesPerSec: 1024, txBytesPerSec: 2048 },
];

describe('NetworkMonitor (node project)', () => {
  it('read returns active interfaces from the source', async () => {
    const source: NetworkSource = async () => active;
    const monitor = new NetworkMonitor(source);
    await expect(monitor.read()).resolves.toEqual(active);
  });

  it('read yields empty array when source fails (no crash)', async () => {
    const source: NetworkSource = async () => {
      throw new Error('pdh boom');
    };
    const monitor = new NetworkMonitor(source);
    await expect(monitor.read()).resolves.toEqual([]);
  });

  it('aggregateNetworkCounters filters zero-activity adapters and splits rx/tx', () => {
    const result = aggregateNetworkCounters([
      {
        Path: '\\Network Interface(Ethernet)\\Bytes Received/sec',
        InstanceName: 'Ethernet',
        Value: 512,
      },
      {
        Path: '\\Network Interface(Ethernet)\\Bytes Sent/sec',
        InstanceName: 'Ethernet',
        Value: 128,
      },
      {
        Path: '\\Network Interface(Virtual)\\Bytes Received/sec',
        InstanceName: 'Virtual',
        Value: 0,
      },
      { Path: '\\Network Interface(Virtual)\\Bytes Sent/sec', InstanceName: 'Virtual', Value: 0 },
    ]);

    expect(result).toEqual([
      { id: 'Ethernet', name: 'Ethernet', rxBytesPerSec: 512, txBytesPerSec: 128 },
    ]);
  });
});
