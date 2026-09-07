import { contextBridge, ipcRenderer } from 'electron';
import type { AppAPI } from '@shared/api';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcResult, PingResponse, ReportRendererErrorRequest } from '@shared/ipc';

const api: AppAPI = {
  ping: (): Promise<IpcResult<PingResponse>> => ipcRenderer.invoke(IPC_CHANNELS.ping),
  reportRendererError: (request: ReportRendererErrorRequest): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.reportRendererError, request),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
    try {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      void ipcRenderer.invoke(IPC_CHANNELS.reportRendererError, {
        scope: 'preload' as const,
        message: `preload expose failed: ${message}`,
        stack,
      });
    } catch {
      // ignore secondary failure
    }
  }
} else {
  // @ts-expect-error (define in dts)
  window.api = api;
}
