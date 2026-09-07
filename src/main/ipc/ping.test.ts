import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SHARED_CONTRACT_VERSION } from '@shared/api';
import { IPC_CHANNELS } from '@shared/ipc/channels';

// Mock electron before importing main ipc module
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

import {
  createPingHandler,
  createReportRendererErrorHandler,
  withSafeHandler,
  __clearIpcRateMapForTests,
  registerIpcHandlers,
} from './index';
import { ipcMain } from 'electron';

describe('Main IPC — ping handler (node project)', () => {
  beforeEach(() => {
    __clearIpcRateMapForTests();
    vi.clearAllMocks();
  });

  it('registerIpcHandlers registers all IPC channels', () => {
    registerIpcHandlers();
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.ping, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC_CHANNELS.reportRendererError,
      expect.any(Function)
    );
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.cpuInfo, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.cpuUsage, expect.any(Function));
  });

  it('ping handler returns ok:true with pong, contractVersion and timestamp', async () => {
    const handler = createPingHandler();
    const result = await handler({} as Electron.IpcMainInvokeEvent, undefined);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pong).toBe(true);
      expect(result.data.contractVersion).toBe(SHARED_CONTRACT_VERSION);
      expect(typeof result.data.timestamp).toBe('number');
    }
  });

  it('ping handler rejects payload and returns ok:false without stack', async () => {
    const handler = createPingHandler();
    // @ts-expect-error — intentionally passing invalid payload to test validation
    const result = await handler({} as Electron.IpcMainInvokeEvent, { invalid: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBeDefined();
      expect(result.error.message).toBeDefined();
      // Must not leak stack
      expect((result.error as Record<string, unknown>).stack).toBeUndefined();
    }
  });

  it('withSafeHandler maps thrown error to IpcResult ok:false without stack', async () => {
    const failing = withSafeHandler('test:channel', async () => {
      throw new Error('boom');
    });
    const result = await failing({} as Electron.IpcMainInvokeEvent, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('boom');
      expect((result.error as Record<string, unknown>).stack).toBeUndefined();
    }
  });

  it('withSafeHandler returns ok:true on success', async () => {
    const succeeding = withSafeHandler('test:channel', async (req: string) => `echo:${req}`);
    const result = await succeeding({} as Electron.IpcMainInvokeEvent, 'hello');
    expect(result).toEqual({ ok: true, data: 'echo:hello' });
  });

  it('withSafeHandler returns RATE_LIMITED when exceeding threshold', async () => {
    const handler = withSafeHandler('test:rate', async () => 'ok');
    // Exhaust 20 allowed hits
    for (let i = 0; i < 20; i += 1) {
      await handler({} as Electron.IpcMainInvokeEvent, undefined);
    }
    const limited = await handler({} as Electron.IpcMainInvokeEvent, undefined);
    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(limited.error.code).toBe('RATE_LIMITED');
    }
  });

  it('reportRendererError handler logs and returns ok:true for valid payload', async () => {
    const handler = createReportRendererErrorHandler();
    const result = await handler({} as Electron.IpcMainInvokeEvent, {
      scope: 'renderer',
      message: 'boom',
      stack: 'stack',
    });
    expect(result.ok).toBe(true);
  });

  it('reportRendererError handler returns ok:false for invalid payload without stack leak', async () => {
    const handler = createReportRendererErrorHandler();
    const result = await handler(
      {} as Electron.IpcMainInvokeEvent,
      {
        scope: 'invalid',
        message: 123,
      } as unknown as { scope: 'renderer'; message: string }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as Record<string, unknown>).stack).toBeUndefined();
    }
  });
});
