import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcRequest, IpcResponse } from '@shared/ipc/contracts';
import { IPC_ERROR_CODES, type IpcResult } from '@shared/ipc/errors';
import { getLogger } from '../logger';
import { isFixedVolumeId } from '../storage/scan';
import type { ScanManager } from '../storage/ScanManager';
import { withSafeHandler } from './index';

type ScanStartChannel = typeof IPC_CHANNELS.storageScanStart;
type ScanGetChannel = typeof IPC_CHANNELS.storageScanGet;
type ScanCancelChannel = typeof IPC_CHANNELS.storageScanCancel;

const logger = getLogger('ipc');

function invalidVolumeError(): never {
  throw Object.assign(new Error('Некорректный идентификатор тома'), {
    code: IPC_ERROR_CODES.VALIDATION_FAILED,
  });
}

function requireValidVolumeId(volumeId: unknown): string {
  if (typeof volumeId !== 'string' || !isFixedVolumeId(volumeId)) {
    logger.warn('storage scan aborted: invalid volume id', { volumeId });
    invalidVolumeError();
  }
  return volumeId;
}

export function createScanStartHandler(
  manager: ScanManager
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<ScanStartChannel>
) => Promise<IpcResult<IpcResponse<ScanStartChannel>>> {
  return withSafeHandler<IpcRequest<ScanStartChannel>, IpcResponse<ScanStartChannel>>(
    IPC_CHANNELS.storageScanStart,
    async (request) => {
      const volumeId = requireValidVolumeId(request?.volumeId);
      await manager.startScan(volumeId);
      return undefined as IpcResponse<ScanStartChannel>;
    }
  );
}

export function createScanGetHandler(
  manager: ScanManager
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<ScanGetChannel>
) => Promise<IpcResult<IpcResponse<ScanGetChannel>>> {
  return withSafeHandler<IpcRequest<ScanGetChannel>, IpcResponse<ScanGetChannel>>(
    IPC_CHANNELS.storageScanGet,
    async (request) => {
      const volumeId = requireValidVolumeId(request?.volumeId);
      return manager.getScanResult(volumeId);
    }
  );
}

export function createScanCancelHandler(
  manager: ScanManager
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<ScanCancelChannel>
) => Promise<IpcResult<IpcResponse<ScanCancelChannel>>> {
  return withSafeHandler<IpcRequest<ScanCancelChannel>, IpcResponse<ScanCancelChannel>>(
    IPC_CHANNELS.storageScanCancel,
    async () => {
      manager.cancelScan();
      return undefined as IpcResponse<ScanCancelChannel>;
    }
  );
}

export function registerStorageIpc(manager: ScanManager): void {
  ipcMain.handle(IPC_CHANNELS.storageScanStart, createScanStartHandler(manager));
  ipcMain.handle(IPC_CHANNELS.storageScanGet, createScanGetHandler(manager));
  ipcMain.handle(IPC_CHANNELS.storageScanCancel, createScanCancelHandler(manager));
}