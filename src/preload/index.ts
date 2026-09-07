import { contextBridge, ipcRenderer } from 'electron';
import type { AppAPI, CpuApi } from '@shared/api';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { toErrorParts } from '@shared/ipc/errors';
import type {
  CpuInfoResponse,
  CpuUsageResponse,
  IpcResult,
  PingResponse,
  ReportRendererErrorRequest,
} from '@shared/ipc';

const cpu: CpuApi = {
  getInfo: (): Promise<IpcResult<CpuInfoResponse>> => ipcRenderer.invoke(IPC_CHANNELS.cpuInfo),
  getUsage: (): Promise<IpcResult<CpuUsageResponse>> => ipcRenderer.invoke(IPC_CHANNELS.cpuUsage),
};

const api: AppAPI = {
  ping: (): Promise<IpcResult<PingResponse>> => ipcRenderer.invoke(IPC_CHANNELS.ping),
  reportRendererError: (request: ReportRendererErrorRequest): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.reportRendererError, request),
  cpu,
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
    try {
      const { message, stack } = toErrorParts(error);
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
