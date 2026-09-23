import { describe, expect, it } from 'vitest';
import { setImmediate } from 'node:timers/promises';
import type { ScanProgressEvent } from '@shared/ipc';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { ScanManager } from './ScanManager';
import type { ScanDirEntry, ScanFs } from './scan';

function fileEntry(name: string): ScanDirEntry {
  return { name, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
}

function dirEntry(name: string): ScanDirEntry {
  return { name, isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false };
}

function tinyFs(): ScanFs {
  const entries = [fileEntry('a.bin')];
  return {
    readdir: async () => entries,
    stat: async () => ({ size: 10, isFile: () => true }),
  };
}

function createManager(
  fs: ScanFs,
  throttleMs = 0
): { manager: ScanManager; events: ScanProgressEvent[] } {
  const events: ScanProgressEvent[] = [];
  const manager = new ScanManager({
    fs,
    throttleMs,
    send: (event) => {
      events.push(event);
    },
  });
  return { manager, events };
}

describe('ScanManager', () => {
  it('exposes a default progress throttle of 100ms', () => {
    expect(ScanManager.DEFAULT_THROTTLE_MS).toBe(100);
  });

  it('returns null from getScanResult before any scan', () => {
    const { manager } = createManager(tinyFs());
    expect(manager.getScanResult('X:')).toBeNull();
  });

  it('caches a completed scan and emits scanning + complete events', async () => {
    const { manager, events } = createManager(tinyFs());
    await manager.startScan('X:');
    const result = manager.getScanResult('X:');
    expect(result).not.toBeNull();
    expect(result?.volumeId).toBe('X:');
    expect(result?.totalBytes).toBe(10);
    expect(result?.fileCount).toBe(1);
    expect(manager.getScanResult('Y:')).toBeNull();
    expect(events.map((e) => e.status)).toContain('scanning');
    expect(events.map((e) => e.status)).toContain('complete');
  });

  it('throws SCAN_ALREADY_ACTIVE while a scan is running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gated: ScanFs = {
      readdir: async () => {
        await gate;
        return [];
      },
      stat: async () => ({ size: 0, isFile: () => true }),
    };
    const { manager } = createManager(gated);
    const first = manager.startScan('X:');
    await setImmediate();
    await expect(manager.startScan('Y:')).rejects.toMatchObject({
      code: IPC_ERROR_CODES.SCAN_ALREADY_ACTIVE,
    });
    await manager.cancelScan();
    release();
    await first;
  });

  it('cancels an active scan with a cancelled event and forgets the result', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gated: ScanFs = {
      readdir: async (path) => {
        if (path === 'X:\\') {
          return [dirEntry('sub')];
        }
        if (path === 'X:\\sub') {
          await gate;
          return [dirEntry('sub2')];
        }
        return [];
      },
      stat: async () => ({ size: 0, isFile: () => true }),
    };
    const { manager, events } = createManager(gated);
    const scan = manager.startScan('X:');
    await setImmediate();
    await manager.cancelScan();
    release();
    await scan;
    expect(events.map((e) => e.status)).toContain('cancelled');
    expect(events.map((e) => e.status)).not.toContain('complete');
    expect(manager.getScanResult('X:')).toBeNull();
  });

  it('throws SCAN_NOT_ACTIVE when cancelScan has nothing to cancel', async () => {
    const { manager } = createManager(tinyFs());
    await manager.startScan('X:');
    expect(() => manager.cancelScan()).toThrowError(
      expect.objectContaining({ code: IPC_ERROR_CODES.SCAN_NOT_ACTIVE })
    );
  });

  it('emits a failed event when the scan crashes and clears the active scan', async () => {
    const exploding: ScanFs = {
      readdir: async () => [fileEntry('crash.dat')],
      stat: () => {
        throw new Error('boom');
      },
    };
    const { manager, events } = createManager(exploding);
    await expect(manager.startScan('X:')).rejects.toThrow('boom');
    const failed = events.find((e) => e.status === 'failed');
    expect(failed).toBeDefined();
    expect(failed?.status === 'failed' ? failed.message : '').toBe('boom');
    expect(() => manager.cancelScan()).toThrowError(
      expect.objectContaining({ code: IPC_ERROR_CODES.SCAN_NOT_ACTIVE })
    );
  });

  it('throttles rapid scanning events but always emits the terminal complete', async () => {
    const branchingFs: ScanFs = {
      readdir: async (path) => {
        if (path === 'X:\\') {
          return [fileEntry('root.bin'), dirEntry('a'), dirEntry('b')];
        }
        return [fileEntry('f.bin')];
      },
      stat: async () => ({ size: 10, isFile: () => true }),
    };
    const { manager: free, events: freeEvents } = createManager(branchingFs, 0);
    await free.startScan('X:');
    const freeScanning = freeEvents.filter((e) => e.status === 'scanning').length;
    expect(freeScanning).toBeGreaterThan(1);

    const { manager: throttled, events: throttledEvents } = createManager(
      branchingFs,
      ScanManager.DEFAULT_THROTTLE_MS
    );
    await throttled.startScan('X:');
    const throttledScanning = throttledEvents.filter((e) => e.status === 'scanning').length;
    expect(throttledScanning).toBe(1);
    expect(throttledEvents.map((e) => e.status)).toContain('complete');
  });
});