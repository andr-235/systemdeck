import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcRequest, IpcResponse } from '@shared/ipc/contracts';
import type { IpcResult } from '@shared/ipc/errors';
import { withSafeHandler } from './index';
import { assertNoPayload } from './validate';
import type { GpuMonitor } from '../monitoring/gpu/GpuMonitor';

type GpuInfoChannel = typeof IPC_CHANNELS.gpuInfo;

export function createGpuInfoHandler(
  monitor: GpuMonitor
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<GpuInfoChannel>
) => Promise<IpcResult<IpcResponse<GpuInfoChannel>>> {
  return withSafeHandler<IpcRequest<GpuInfoChannel>, IpcResponse<GpuInfoChannel>>(
    IPC_CHANNELS.gpuInfo,
    async (request) => {
      assertNoPayload(request, 'gpu:info');
      return monitor.getInfo();
    }
  );
}

export function registerGpuIpc(monitor: GpuMonitor): void {
  ipcMain.handle(IPC_CHANNELS.gpuInfo, createGpuInfoHandler(monitor));
}
