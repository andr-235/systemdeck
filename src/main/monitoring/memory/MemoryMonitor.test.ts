import { describe, it, expect } from 'vitest';
import {
  MemoryMonitor,
  defaultSwapSource,
  type SwapSource,
  type MemorySource,
} from './MemoryMonitor';
import type { SwapMetrics } from '@shared/ipc';

const swapOk: SwapMetrics = { total: 8000, used: 2000, percent: 25 };
const memSource: MemorySource = () => ({ total: 16000, available: 4000 });

describe('MemoryMonitor (node project)', () => {
  it('read returns memory metrics in bytes with derived percent', () => {
    const monitor = new MemoryMonitor({ memorySource: memSource });
    const metrics = monitor.read();

    expect(metrics.total).toBe(16000);
    expect(metrics.used).toBe(12000);
    expect(metrics.available).toBe(4000);
    expect(metrics.percent).toBe(75);
    expect(metrics.swap).toBeNull();
  });

  it('zero/invalid total yields full Unavailable (null), not fabricated 0', () => {
    const monitor = new MemoryMonitor({ memorySource: () => ({ total: 0, available: 0 }) });
    const metrics = monitor.read();

    expect(metrics.total).toBeNull();
    expect(metrics.used).toBeNull();
    expect(metrics.percent).toBeNull();
  });

  it('used does not exceed total when available overflows', () => {
    const monitor = new MemoryMonitor({ memorySource: () => ({ total: 16000, available: 20000 }) });
    const metrics = monitor.read();

    expect(metrics.used).toBe(0);
    expect(metrics.percent).toBe(0);
  });

  it('readMemoryWithSwap includes swap from the source', async () => {
    const swapSource: SwapSource = async () => swapOk;
    const monitor = new MemoryMonitor({ memorySource: memSource, swapSource });
    const metrics = await monitor.readMemoryWithSwap();

    expect(metrics.swap).toEqual(swapOk);
  });

  it('readMemoryWithSwap yields null swap when source returns null (no pagefile)', async () => {
    const swapSource: SwapSource = async () => null;
    const monitor = new MemoryMonitor({ memorySource: memSource, swapSource });
    const metrics = await monitor.readMemoryWithSwap();

    expect(metrics.swap).toBeNull();
  });

  it('defaultSwapSource returns null on non-Windows', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    try {
      await expect(defaultSwapSource()).resolves.toBeNull();
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    }
  });
});
