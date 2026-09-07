import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { CpuInfoResponse, CpuUsageResponse } from '@shared/ipc';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

import { ipcMain } from 'electron';
import { CpuMonitor } from '../monitoring/cpu/CpuMonitor';
import { createCpuInfoHandler, createCpuUsageHandler, registerCpuIpc } from './cpu';

function makeMonitorStub(overrides: {
  getInfo?: CpuInfoResponse;
  getUsage?: CpuUsageResponse;
}): CpuMonitor {
  const monitor = {} as CpuMonitor;
  if (overrides.getInfo) monitor.getInfo = vi.fn(async () => overrides.getInfo!);
  if (overrides.getUsage) monitor.getUsage = vi.fn(() => overrides.getUsage!);
  return monitor;
}

describe('Main IPC — CPU handlers (node project)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cpu:info handler returns ok:true with info from monitor', async () => {
    const info: CpuInfoResponse = {
      model: 'Intel Core i7',
      clockMhz: 4200,
      logicalCores: 8,
      physicalCores: 4,
    };
    const monitor = makeMonitorStub({ getInfo: info });
    const handler = createCpuInfoHandler(monitor);
    const result = await handler({} as Electron.IpcMainInvokeEvent, undefined);

    expect(result).toEqual({ ok: true, data: info });
  });

  it('cpu:usage handler returns ok:true with usage from monitor', async () => {
    const usage: CpuUsageResponse = { overall: 42.5, perCore: [42.5], timestamp: 123 };
    const monitor = makeMonitorStub({ getUsage: usage });
    const handler = createCpuUsageHandler(monitor);
    const result = await handler({} as Electron.IpcMainInvokeEvent, undefined);

    expect(result).toEqual({ ok: true, data: usage });
  });

  it('handler maps monitor throw to ok:false without stack', async () => {
    const monitor = {} as CpuMonitor;
    monitor.getUsage = vi.fn(() => {
      throw new Error('wmi boom');
    });
    const handler = createCpuUsageHandler(monitor);
    const result = await handler({} as Electron.IpcMainInvokeEvent, undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('wmi boom');
      expect((result.error as Record<string, unknown>).stack).toBeUndefined();
    }
  });

  it('registerCpuIpc registers cpu:info and cpu:usage channels', () => {
    const monitor = {} as CpuMonitor;
    registerCpuIpc(monitor);
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.cpuInfo, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.cpuUsage, expect.any(Function));
  });
});
