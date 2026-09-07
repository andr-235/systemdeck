import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppAPI,
  CpuInfoApi,
  GpuInfoApi,
  LiveApi,
  SystemInfoApi,
  Unsubscribe,
} from '@shared/api';
import { IPC_CHANNELS, IPC_PUSH_CHANNELS } from '@shared/ipc/channels';
import { toErrorParts } from '@shared/ipc/errors';
import type {
  CpuInfoResponse,
  GpuInfoResponse,
  IpcResult,
  LiveSnapshot,
  LiveSubscribeRequest,
  LiveSubscribeResponse,
  PingRequest,
  ProcessSnapshot,
  ReportRendererErrorRequest,
  SystemInfoResponse,
} from '@shared/ipc';

const cpu: CpuInfoApi = {
  getInfo: (): Promise<IpcResult<CpuInfoResponse>> => ipcRenderer.invoke(IPC_CHANNELS.cpuInfo),
};

const system: SystemInfoApi = {
  getInfo: (): Promise<IpcResult<SystemInfoResponse>> =>
    ipcRenderer.invoke(IPC_CHANNELS.systemInfo),
};

const gpu: GpuInfoApi = {
  getInfo: (): Promise<IpcResult<GpuInfoResponse>> => ipcRenderer.invoke(IPC_CHANNELS.gpuInfo),
};

const live: LiveApi = {
  subscribe: (request: LiveSubscribeRequest): Promise<IpcResult<LiveSubscribeResponse>> =>
    ipcRenderer.invoke(IPC_CHANNELS.liveSubscribe, request),
  unsubscribe: (): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC_CHANNELS.liveUnsubscribe),
};

function subscribePush<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => {
    callback(payload);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: AppAPI = {
  ping: (request: PingRequest): Promise<IpcResult<{ version: string; matched: boolean }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ping, request),
  reportRendererError: (request: ReportRendererErrorRequest): Promise<IpcResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.reportRendererError, request),
  cpu,
  system,
  gpu,
  live,
  onLiveSnapshot: (callback: (snapshot: LiveSnapshot) => void): Unsubscribe =>
    subscribePush<LiveSnapshot>(IPC_PUSH_CHANNELS.liveSnapshot, callback),
  onProcessSnapshot: (callback: (snapshot: ProcessSnapshot) => void): Unsubscribe =>
    subscribePush<ProcessSnapshot>(IPC_PUSH_CHANNELS.processSnapshot, callback),
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
