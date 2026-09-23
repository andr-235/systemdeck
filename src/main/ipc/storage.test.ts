import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setImmediate } from 'node:timers/promises';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

const loggerMock = vi.hoisted(() => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../logger', () => ({ getLogger: () => loggerMock }));

import { IPC_CHANNELS } from '@shared/ipc/channels';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { ipcMain } from 'electron';
import { ScanManager } from '../storage/ScanManager';
import type { ScanDirEntry, ScanFs } from '../storage/scan';
import {
  createScanCancelHandler,
  createScanGetHandler,
  createScanStartHandler,
  registerStorageIpc,
} from './storage';
import type { ScanProgressEvent } from '@shared/ipc';

function fileEntry(name: string): ScanDirEntry {
  return { name, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
}

function dirEntry(name: string): ScanDirEntry {
  return { name, isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false };
}

function tinyFs(): ScanFs {
  return {
    readdir: async () => [fileEntry('a.bin')],
    stat: async () => ({ size: 10, isFile: () => true }),
  };
}

function makeManager(send: (event: ScanProgressEvent) => void = () => {}): ScanManager {
  return new ScanManager({ fs: tinyFs(), throttleMs: 0, send });
}

describe('Main IPC — storage scan (node project)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registerStorageIpc wires all storage channels', () => {
    registerStorageIpc(makeManager());
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC_CHANNELS.storageScanStart,
      expect.any(Function)
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.storageScanGet, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC_CHANNELS.storageScanCancel,
      expect.any(Function)
    );
  });

  it('startScan rejects malformed volume ids with VALIDATION_FAILED', async () => {
    const start = createScanStartHandler(makeManager());
    for (const bad of ['C', 'C:\\', 'CC:', '1:', '', null, undefined, 5]) {
      const result = await start(
        {} as Electron.IpcMainInvokeEvent,
        { volumeId: bad } as never
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(IPC_ERROR_CODES.VALIDATION_FAILED);
    }
  });

  it('returns null from getScanResult before scanning, and the cached result after', async () => {
    const manager = makeManager();
    const start = createScanStartHandler(manager);
    const get = createScanGetHandler(manager);
    const before = await get({} as Electron.IpcMainInvokeEvent, { volumeId: 'X:' });
    expect(before.ok).toBe(true);
    if (before.ok) expect(before.data).toBeNull();

    const started = await start({} as Electron.IpcMainInvokeEvent, { volumeId: 'X:' });
    expect(started.ok).toBe(true);

    const after = await get({} as Electron.IpcMainInvokeEvent, { volumeId: 'X:' });
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.data?.volumeId).toBe('X:');
      expect(after.data?.totalBytes).toBe(10);
    }
  });

  it('startScan refuses a second scan while one is running with SCAN_ALREADY_ACTIVE', async () => {
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
    const manager = new ScanManager({ fs: gated, throttleMs: 0, send: () => {} });
    const start = createScanStartHandler(manager);
    const first = start({} as Electron.IpcMainInvokeEvent, { volumeId: 'X:' });
    await setImmediate();
    const second = await start({} as Electron.IpcMainInvokeEvent, { volumeId: 'Y:' });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe(IPC_ERROR_CODES.SCAN_ALREADY_ACTIVE);
    release();
    await first;
  });

  it('cancelling an active scan returns ok:true and yields a cancelled result', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const events: ScanProgressEvent[] = [];
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
    const manager = new ScanManager({
      fs: gated,
      throttleMs: 0,
      send: (event) => {
        events.push(event);
      },
    });
    const start = createScanStartHandler(manager);
    const cancel = createScanCancelHandler(manager);
    const scan = start({} as Electron.IpcMainInvokeEvent, { volumeId: 'X:' });
    await setImmediate();
    const cancelled = await cancel({} as Electron.IpcMainInvokeEvent, undefined);
    expect(cancelled.ok).toBe(true);
    release();
    const finished = await scan;
    expect(finished.ok).toBe(true);
    expect(events.map((e) => e.status)).toContain('cancelled');
    expect(events.map((e) => e.status)).not.toContain('complete');
  });

  it('cancelScan returns SCAN_NOT_ACTIVE when nothing is running', async () => {
    const cancel = createScanCancelHandler(makeManager());
    const result = await cancel({} as Electron.IpcMainInvokeEvent, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(IPC_ERROR_CODES.SCAN_NOT_ACTIVE);
  });
});