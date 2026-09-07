import { ipcMain } from 'electron';
import { IPC_CHANNELS, type IpcChannel } from '@shared/ipc/channels';
import { SHARED_CONTRACT_VERSION } from '@shared/api';
import type { IpcRequest, IpcResponse } from '@shared/ipc/contracts';
import {
  IPC_ERROR_CODES,
  ipcFailure,
  ipcSuccess,
  toErrorParts,
  type IpcResult,
} from '@shared/ipc/errors';
import { getLogger } from '../logger';

const IPC_RATE_LIMIT_WINDOW_MS = 1000;
const IPC_RATE_LIMIT_MAX = 20;
const ipcRateMap = new Map<string, number[]>();

function isRateLimited(channel: IpcChannel | string): boolean {
  const now = Date.now();
  const hits = ipcRateMap.get(channel) ?? [];
  const recent = hits.filter((t) => now - t < IPC_RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  ipcRateMap.set(channel, recent);
  return recent.length > IPC_RATE_LIMIT_MAX;
}

/** @internal — только для тестов, сбрасывает rate-limit между кейсами */
export function __clearIpcRateMapForTests(): void {
  ipcRateMap.clear();
}

export function withSafeHandler<TReq, TRes>(
  channel: IpcChannel | string,
  handler: (request: TReq) => Promise<TRes> | TRes
): (event: Electron.IpcMainInvokeEvent, request: TReq) => Promise<IpcResult<TRes>> {
  return async (_event, request) => {
    const logger = getLogger('ipc');
    if (isRateLimited(channel)) {
      logger.warn(`rate limited: ${String(channel)}`);
      return ipcFailure({ code: IPC_ERROR_CODES.RATE_LIMITED, message: 'Too many requests' });
    }
    try {
      const data = await handler(request);
      logger.debug(`ipc success: ${String(channel)}`);
      return ipcSuccess(data);
    } catch (error) {
      logger.error(`ipc failure: ${String(channel)}`, { error: toErrorParts(error) });
      return ipcFailure(error);
    }
  };
}

type PingChannel = typeof IPC_CHANNELS.ping;

export function createPingHandler(): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<PingChannel>
) => Promise<IpcResult<IpcResponse<PingChannel>>> {
  return withSafeHandler<IpcRequest<PingChannel>, IpcResponse<PingChannel>>(
    IPC_CHANNELS.ping,
    async (request) => {
      // Validation: PingRequest must be void/undefined — reject any payload (future-proof)
      if (request !== undefined && request !== null) {
        throw new Error('Invalid ping payload');
      }
      return {
        pong: true as const,
        contractVersion: SHARED_CONTRACT_VERSION,
        timestamp: Date.now(),
      };
    }
  );
}

type ReportChannel = typeof IPC_CHANNELS.reportRendererError;

export function createReportRendererErrorHandler(): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<ReportChannel>
) => Promise<IpcResult<IpcResponse<ReportChannel>>> {
  return withSafeHandler<IpcRequest<ReportChannel>, IpcResponse<ReportChannel>>(
    IPC_CHANNELS.reportRendererError,
    async (request) => {
      const logger = getLogger('renderer');
      if (
        !request ||
        typeof request.message !== 'string' ||
        (request.scope !== 'renderer' && request.scope !== 'preload')
      ) {
        throw new Error('Invalid reportRendererError payload');
      }
      logger.error(`renderer error [${request.scope}]: ${request.message}`, {
        stack: request.stack,
        componentStack: request.componentStack,
      });
      return undefined as IpcResponse<ReportChannel>;
    }
  );
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ping, createPingHandler());
  ipcMain.handle(IPC_CHANNELS.reportRendererError, createReportRendererErrorHandler());
}
