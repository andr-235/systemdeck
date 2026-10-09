import { beforeAll, describe, expect, it, vi } from 'vitest';
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, IPC_PUSH_CHANNELS } from '@shared/ipc/channels';
import type { AppAPI, Unsubscribe } from '@shared/api';
import type { CleanerPreviewRequest, CleanupProgressEvent } from '@shared/ipc/contracts';

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(async () => ({ ok: true, data: undefined })),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

let exposedApi: AppAPI;

beforeAll(async () => {
  (process as { contextIsolated?: boolean }).contextIsolated = true;
  await import('./index');
  const expose = vi.mocked(contextBridge.exposeInMainWorld);
  expect(expose).toHaveBeenCalledWith('api', expect.any(Object));
  exposedApi = expose.mock.calls[0][1] as AppAPI;
});

describe('preload cleaner Application API', () => {
  it('publishes exactly the declared cleaner methods', () => {
    expect(Object.keys(exposedApi.cleaner).sort()).toEqual([
      'cancel',
      'delete',
      'onProgress',
      'preview',
    ]);
    expect(exposedApi.cleaner).not.toHaveProperty('ipcRenderer');
    expect(exposedApi.cleaner).not.toHaveProperty('invoke');
  });

  it('routes preview/delete/cancel through their channels with the caller payload', async () => {
    const previewRequest: CleanerPreviewRequest = { categories: ['user-temp'] };
    await exposedApi.cleaner.preview(previewRequest);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.cleanerPreview, previewRequest);
    await exposedApi.cleaner.delete({ sessionId: 's', candidateIds: ['c'] });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.cleanerDelete, {
      sessionId: 's',
      candidateIds: ['c'],
    });
    await exposedApi.cleaner.cancel({ operationId: 'op' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.cleanerCancel, {
      operationId: 'op',
    });
  });

  it('subscribes onProgress and returns a working unsubscribe', () => {
    const received: CleanupProgressEvent[] = [];
    const unsubscribe: Unsubscribe = exposedApi.cleaner.onProgress((event) => received.push(event));
    expect(ipcRenderer.on).toHaveBeenCalledTimes(1);
    const [channel, listener] = vi.mocked(ipcRenderer.on).mock.calls[0];
    expect(channel).toBe(IPC_PUSH_CHANNELS.cleanerProgress);
    const terminal: CleanupProgressEvent = {
      operationId: 'op-1',
      sessionId: 's-1',
      status: 'completed',
      timestamp: 1,
      report: { items: [], total: 0, deleted: 0, skipped: 0, failed: 0, freedBytes: 0 },
    };
    (listener as (event: unknown, payload: CleanupProgressEvent) => void)({}, terminal);
    expect(received).toEqual([terminal]);
    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channel, listener);
  });
});
