import { contextBridge, ipcRenderer } from 'electron';
import type { AppAPI } from '@shared/api';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcResult, PingResponse } from '@shared/ipc';

const api: AppAPI = {
  ping: (): Promise<IpcResult<PingResponse>> => ipcRenderer.invoke(IPC_CHANNELS.ping),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error (define in dts)
  window.api = api;
}
