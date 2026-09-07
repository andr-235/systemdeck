import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcRequest, IpcResponse } from '@shared/ipc/contracts';
import { IPC_ERROR_CODES, type IpcResult } from '@shared/ipc/errors';
import { getLogger } from '../logger';
import { classifyProtectedProcessName } from '../monitoring/process/ProcessMonitor';
import { resolveProcessName, terminateProcess } from '../system/processTerminator';
import { withSafeHandler } from './index';

type ProcessTerminateChannel = typeof IPC_CHANNELS.processTerminate;

export type ProcessTerminateDeps = {
  resolveProcessName?: (pid: number) => Promise<string | null>;
  terminateProcess?: (pid: number) => Promise<void>;
};

export function createProcessTerminateHandler(
  deps: ProcessTerminateDeps = {}
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<ProcessTerminateChannel>
) => Promise<IpcResult<IpcResponse<ProcessTerminateChannel>>> {
  const resolveName = deps.resolveProcessName ?? resolveProcessName;
  const terminate = deps.terminateProcess ?? terminateProcess;
  return withSafeHandler<IpcRequest<ProcessTerminateChannel>, IpcResponse<ProcessTerminateChannel>>(
    IPC_CHANNELS.processTerminate,
    async (request) => {
      const pid = typeof request?.pid === 'number' ? request.pid : NaN;
      if (!Number.isInteger(pid) || pid <= 0) {
        throw Object.assign(new Error('Некорректный PID процесса'), {
          code: IPC_ERROR_CODES.VALIDATION_FAILED,
        });
      }
      const name = await resolveName(pid);
      if (name === null) {
        throw Object.assign(new Error('Процесс не найден или уже завершён'), {
          code: IPC_ERROR_CODES.PROCESS_NOT_FOUND,
        });
      }
      if (classifyProtectedProcessName(name)) {
        throw Object.assign(new Error('Завершение защищённого процесса запрещено'), {
          code: IPC_ERROR_CODES.PROCESS_PROTECTED,
        });
      }
      await terminate(pid);
      getLogger('process').info('process terminated', { pid, name });
      return undefined as IpcResponse<ProcessTerminateChannel>;
    }
  );
}

export function registerProcessIpc(deps: ProcessTerminateDeps = {}): void {
  ipcMain.handle(IPC_CHANNELS.processTerminate, createProcessTerminateHandler(deps));
}
