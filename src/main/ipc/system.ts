import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcRequest, IpcResponse } from '@shared/ipc/contracts';
import type { IpcResult } from '@shared/ipc/errors';
import { withSafeHandler } from './index';
import { assertNoPayload } from './validate';
import type { SystemInfoMonitor } from '../monitoring/system/SystemInfoMonitor';

type SystemInfoChannel = typeof IPC_CHANNELS.systemInfo;

export function createSystemInfoHandler(
  monitor: SystemInfoMonitor
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<SystemInfoChannel>
) => Promise<IpcResult<IpcResponse<SystemInfoChannel>>> {
  return withSafeHandler<IpcRequest<SystemInfoChannel>, IpcResponse<SystemInfoChannel>>(
    IPC_CHANNELS.systemInfo,
    async (request) => {
      assertNoPayload(request, 'system:info');
      return monitor.getInfo();
    }
  );
}

export function registerSystemInfoIpc(monitor: SystemInfoMonitor): void {
  ipcMain.handle(IPC_CHANNELS.systemInfo, createSystemInfoHandler(monitor));
}
