import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcRequest, IpcResponse } from '@shared/ipc/contracts';
import type { IpcResult } from '@shared/ipc/errors';
import { withSafeHandler } from './index';
import { assertNoPayload } from './validate';
import type { CpuMonitor } from '../monitoring/cpu/CpuMonitor';

type CpuInfoChannel = typeof IPC_CHANNELS.cpuInfo;
type CpuUsageChannel = typeof IPC_CHANNELS.cpuUsage;

export function createCpuInfoHandler(
  monitor: CpuMonitor
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<CpuInfoChannel>
) => Promise<IpcResult<IpcResponse<CpuInfoChannel>>> {
  return withSafeHandler<IpcRequest<CpuInfoChannel>, IpcResponse<CpuInfoChannel>>(
    IPC_CHANNELS.cpuInfo,
    async (request) => {
      assertNoPayload(request, 'cpu:info');
      return monitor.getInfo();
    }
  );
}

export function createCpuUsageHandler(
  monitor: CpuMonitor
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<CpuUsageChannel>
) => Promise<IpcResult<IpcResponse<CpuUsageChannel>>> {
  return withSafeHandler<IpcRequest<CpuUsageChannel>, IpcResponse<CpuUsageChannel>>(
    IPC_CHANNELS.cpuUsage,
    async (request) => {
      assertNoPayload(request, 'cpu:usage');
      return monitor.getUsage();
    }
  );
}

export function registerCpuIpc(monitor: CpuMonitor): void {
  ipcMain.handle(IPC_CHANNELS.cpuInfo, createCpuInfoHandler(monitor));
  ipcMain.handle(IPC_CHANNELS.cpuUsage, createCpuUsageHandler(monitor));
}
