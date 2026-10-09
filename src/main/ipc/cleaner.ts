import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { CleanupCategory, IpcRequest, IpcResponse } from '@shared/ipc/contracts';
import { IPC_ERROR_CODES, type IpcResult } from '@shared/ipc/errors';
import { isCleanupCategory } from '../cleaner/categories';
import type { CleanerManager } from '../cleaner/CleanerManager';
import { withSafeHandler } from './index';

type PreviewChannel = typeof IPC_CHANNELS.cleanerPreview;
type DeleteChannel = typeof IPC_CHANNELS.cleanerDelete;
type CancelChannel = typeof IPC_CHANNELS.cleanerCancel;

function invalid(message: string): never {
  throw Object.assign(new Error(message), { code: IPC_ERROR_CODES.VALIDATION_FAILED });
}

function requireCategories(request: IpcRequest<PreviewChannel>): CleanupCategory[] {
  const categories = request?.categories;
  if (
    !Array.isArray(categories) ||
    categories.length === 0 ||
    !categories.every(isCleanupCategory)
  ) {
    invalid('Ожидается непустой список идентификаторов категорий');
  }
  return categories;
}

function requireSessionAndIds(request: IpcRequest<DeleteChannel>): {
  sessionId: string;
  candidateIds: string[];
} {
  const sessionId = request?.sessionId;
  const candidateIds = request?.candidateIds;
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    invalid('Ожидается идентификатор сессии предпросмотра');
  }
  // Путь из Renderer не читается: только ID кандидатов (SEC-001).
  if (!Array.isArray(candidateIds) || !candidateIds.every((id) => typeof id === 'string')) {
    invalid('Ожидается массив идентификаторов кандидатов');
  }
  return { sessionId, candidateIds };
}

function requireOperationId(request: IpcRequest<CancelChannel>): string {
  const operationId = request?.operationId;
  if (typeof operationId !== 'string' || operationId.length === 0) {
    invalid('Ожидается идентификатор операции');
  }
  return operationId;
}

export function createCleanerPreviewHandler(
  manager: CleanerManager
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<PreviewChannel>
) => Promise<IpcResult<IpcResponse<PreviewChannel>>> {
  return withSafeHandler<IpcRequest<PreviewChannel>, IpcResponse<PreviewChannel>>(
    IPC_CHANNELS.cleanerPreview,
    async (request) => manager.preview(requireCategories(request))
  );
}

export function createCleanerDeleteHandler(
  manager: CleanerManager
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<DeleteChannel>
) => Promise<IpcResult<IpcResponse<DeleteChannel>>> {
  return withSafeHandler<IpcRequest<DeleteChannel>, IpcResponse<DeleteChannel>>(
    IPC_CHANNELS.cleanerDelete,
    async (request) => manager.startDelete(requireSessionAndIds(request))
  );
}

export function createCleanerCancelHandler(
  manager: CleanerManager
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<CancelChannel>
) => Promise<IpcResult<IpcResponse<CancelChannel>>> {
  return withSafeHandler<IpcRequest<CancelChannel>, IpcResponse<CancelChannel>>(
    IPC_CHANNELS.cleanerCancel,
    async (request) => {
      manager.cancel(requireOperationId(request));
      return undefined as IpcResponse<CancelChannel>;
    }
  );
}

export function registerCleanerIpc(manager: CleanerManager): void {
  ipcMain.handle(IPC_CHANNELS.cleanerPreview, createCleanerPreviewHandler(manager));
  ipcMain.handle(IPC_CHANNELS.cleanerDelete, createCleanerDeleteHandler(manager));
  ipcMain.handle(IPC_CHANNELS.cleanerCancel, createCleanerCancelHandler(manager));
}
