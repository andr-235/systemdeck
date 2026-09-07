import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CpuMonitor, defaultPhysicalCores, type CpuTickCore, type CpuSnapshot } from './CpuMonitor';
import type { CpuInfoResponse } from '@shared/ipc';

function makeCore(user: number, nice: number, sys: number, idle: number, irq: number): CpuTickCore {
  return { user, nice, sys, idle, irq };
}

function makeSnapshot(cores: CpuTickCore[], model = '', speedMhz = 0): CpuSnapshot {
  return { model, speedMhz, cores };
}

describe('CpuMonitor — CPU load computation (node project)', () => {
  let tickSource = vi.fn<() => CpuSnapshot>();
  let physicalCores = vi.fn<() => Promise<number | null>>();

  beforeEach(() => {
    tickSource = vi.fn();
    physicalCores = vi.fn();
  });

  function makeMonitor(): CpuMonitor {
    return new CpuMonitor({
      tickSource,
      physicalCores,
    });
  }

  it('returns null overall/perCore on first call (lazy baseline), real values on next', async () => {
    tickSource
      .mockReturnValueOnce(makeSnapshot([makeCore(100, 0, 50, 850, 0)]))
      .mockReturnValueOnce(makeSnapshot([makeCore(200, 0, 100, 1700, 0)]));

    const monitor = makeMonitor();
    const first = monitor.getLive();
    const second = monitor.getLive();

    expect(first.overall).toBeNull();
    expect(first.perCore).toEqual([null]);

    // delta: busy +100, +50; idle +850 → ((150)/(1000))*100 = 15
    expect(second.overall).toBe(15);
    expect(second.perCore).toEqual([15]);
  });

  it('computes per-core utilization from ticks independently', async () => {
    // core0: busy +100 of +200 → 50%
    // core1: busy +0 of +200 → 0%
    tickSource
      .mockReturnValueOnce(makeSnapshot([makeCore(0, 0, 0, 100, 0), makeCore(100, 0, 0, 0, 0)]))
      .mockReturnValueOnce(
        makeSnapshot([makeCore(0, 0, 100, 200, 0), makeCore(100, 0, 0, 200, 0)])
      );

    const monitor = makeMonitor();
    monitor.getLive();
    const usage = monitor.getLive();

    expect(usage.overall).toBe(25);
    expect(usage.perCore).toEqual([50, 0]);
  });

  it('rounds utilization to 0.1', async () => {
    // busy 1 of total 3 → 33.333 → 33.3
    tickSource
      .mockReturnValueOnce(makeSnapshot([makeCore(0, 0, 0, 100, 0)]))
      .mockReturnValueOnce(makeSnapshot([makeCore(0, 0, 1, 102, 0)]));

    const monitor = makeMonitor();
    monitor.getLive();
    expect(monitor.getLive().overall).toBe(33.3);
  });

  it('returns null when no ticks elapsed between calls instead of guessing 0', () => {
    tickSource.mockReturnValue(makeSnapshot([makeCore(0, 0, 0, 100, 0)]));

    const monitor = makeMonitor();
    monitor.getLive();
    const usage = monitor.getLive();

    expect(usage.overall).toBeNull();
    expect(usage.perCore).toEqual([null]);
  });

  it('getInfo returns model (may be empty), clockMhz, logical cores and cached physical cores', async () => {
    tickSource.mockReturnValue(
      makeSnapshot([makeCore(0, 0, 0, 100, 0), makeCore(0, 0, 0, 100, 0)])
    );
    physicalCores.mockResolvedValue(8);

    const monitor = makeMonitor();
    const info = await monitor.getInfo();

    expect(info).toMatchObject<Partial<CpuInfoResponse>>({
      model: '',
      clockMhz: 0,
      logicalCores: 2,
      physicalCores: 8,
    });
    expect(physicalCores).toHaveBeenCalledTimes(1);
  });

  it('caches cpu info — repeated calls do not re-run WMI', async () => {
    tickSource.mockReturnValue(makeSnapshot([makeCore(0, 0, 0, 100, 0)]));
    physicalCores.mockResolvedValue(4);

    const monitor = makeMonitor();
    await monitor.getInfo();
    await monitor.getInfo();

    expect(physicalCores).toHaveBeenCalledTimes(1);
  });

  it('physical core failure yields null and is cached (no retry)', async () => {
    tickSource.mockReturnValue(makeSnapshot([makeCore(0, 0, 0, 100, 0)]));
    physicalCores.mockResolvedValue(null);

    const monitor = makeMonitor();
    const info = await monitor.getInfo();

    expect(info.physicalCores).toBeNull();
    await monitor.getInfo();
    expect(physicalCores).toHaveBeenCalledTimes(1);
  });

  it('does not invent utilization for a core that appeared between snapshots', async () => {
    tickSource
      .mockReturnValueOnce(makeSnapshot([makeCore(0, 0, 0, 100, 0)]))
      .mockReturnValueOnce(makeSnapshot([makeCore(0, 0, 100, 200, 0), makeCore(50, 0, 0, 50, 0)]));

    const monitor = makeMonitor();
    monitor.getLive();
    const usage = monitor.getLive();

    expect(usage.perCore).toEqual([50, null]);
    expect(usage.overall).toBe(50);
  });

  it('returns null when ticks reset (counter rollover), not an invented drop', async () => {
    tickSource
      .mockReturnValueOnce(makeSnapshot([makeCore(1000, 0, 500, 8000, 0)]))
      .mockReturnValueOnce(makeSnapshot([makeCore(100, 0, 60, 900, 0)]));

    const monitor = makeMonitor();
    monitor.getLive();
    const usage = monitor.getLive();

    expect(usage.overall).toBeNull();
    expect(usage.perCore).toEqual([null]);
  });

  it('defaultPhysicalCores returns null on non-Windows without spawning powershell', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    try {
      await expect(defaultPhysicalCores()).resolves.toBeNull();
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    }
  });
});
