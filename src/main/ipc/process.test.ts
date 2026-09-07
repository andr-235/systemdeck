import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { createProcessTerminateHandler, registerProcessIpc } from './process';
import { ipcMain } from 'electron';

const resolveName = vi.fn<() => Promise<string | null>>();
const terminate = vi.fn<() => Promise<void>>();

function makeHandler(): ReturnType<typeof createProcessTerminateHandler> {
  return createProcessTerminateHandler({
    resolveProcessName: resolveName,
    terminateProcess: terminate,
  });
}

describe('Main IPC — process termination (node project)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registerProcessIpc wires the terminate channel', () => {
    registerProcessIpc();
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC_CHANNELS.processTerminate,
      expect.any(Function)
    );
  });

  it('terminates a valid non-protected process and returns ok:true', async () => {
    resolveName.mockResolvedValueOnce('chrome.exe');
    terminate.mockResolvedValueOnce();
    const result = await makeHandler()({} as Electron.IpcMainInvokeEvent, { pid: 4242 });
    expect(result.ok).toBe(true);
    expect(terminate).toHaveBeenCalledWith(4242);
    expect(loggerMock.info).toHaveBeenCalledWith('process terminated', {
      pid: 4242,
      name: 'chrome.exe',
    });
  });

  it('refuses protected processes with PROCESS_PROTECTED and never terminates', async () => {
    resolveName.mockResolvedValueOnce('lsass.exe');
    const result = await makeHandler()({} as Electron.IpcMainInvokeEvent, { pid: 4242 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(IPC_ERROR_CODES.PROCESS_PROTECTED);
    expect(terminate).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith('process termination aborted: protected', {
      pid: 4242,
      name: 'lsass.exe',
    });
  });

  it('refuses unknown pid with PROCESS_NOT_FOUND', async () => {
    resolveName.mockResolvedValueOnce(null);
    const result = await makeHandler()({} as Electron.IpcMainInvokeEvent, { pid: 4242 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(IPC_ERROR_CODES.PROCESS_NOT_FOUND);
    expect(terminate).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith('process termination aborted: not found', {
      pid: 4242,
    });
  });

  it('rejects invalid payloads with VALIDATION_FAILED', async () => {
    for (const payload of [{ pid: 0 }, { pid: -1 }, { pid: 1.5 }, { pid: 'x' }, {}, undefined]) {
      const result = await makeHandler()(
        {} as Electron.IpcMainInvokeEvent,
        payload as { pid: number }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(IPC_ERROR_CODES.VALIDATION_FAILED);
    }
    expect(terminate).not.toHaveBeenCalled();
  });

  it('maps a failed termination (access denied) to ok:false without stack leak', async () => {
    resolveName.mockResolvedValueOnce('chrome.exe');
    terminate.mockRejectedValueOnce(new Error('Отказано в доступе'));
    const result = await makeHandler()({} as Electron.IpcMainInvokeEvent, { pid: 4242 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Отказано в доступе');
      expect((result.error as Record<string, unknown>).stack).toBeUndefined();
    }
    expect(loggerMock.error).toHaveBeenCalledWith('process termination failed', {
      pid: 4242,
      name: 'chrome.exe',
      error: expect.objectContaining({ message: 'Отказано в доступе' }),
    });
  });
});
