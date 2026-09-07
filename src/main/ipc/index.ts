import { ipcMain } from 'electron';
import { IPC_CHANNELS, type IpcChannel } from '@shared/ipc/channels';
import type { IpcRequest, IpcResponse } from '@shared/ipc/contracts';
import { SHARED_CONTRACT_VERSION } from '@shared/api';
import {
  IPC_ERROR_CODES,
  ipcFailure,
  ipcSuccess,
  toErrorParts,
  type IpcResult,
} from '@shared/ipc/errors';
import { getLogger } from '../logger';
import { CpuMonitor } from '../monitoring/cpu/CpuMonitor';
import { SystemInfoMonitor } from '../monitoring/system/SystemInfoMonitor';
import { GpuMonitor } from '../monitoring/gpu/GpuMonitor';
import { LiveScheduler } from '../monitoring/live/LiveScheduler';
import { registerCpuIpc } from './cpu';
import { registerSystemInfoIpc } from './system';
import { registerGpuIpc } from './gpu';
import { registerLiveIpc } from './live';

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

type ReportChannel = typeof IPC_CHANNELS.reportRendererError;

export function createPingHandler(): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<typeof IPC_CHANNELS.ping>
) => Promise<IpcResult<IpcResponse<typeof IPC_CHANNELS.ping>>> {
  const channel = IPC_CHANNELS.ping;
  return withSafeHandler<IpcRequest<typeof channel>, IpcResponse<typeof channel>>(
    channel,
    async (request) => {
      if (!request || typeof request.version !== 'string') {
        throw new Error('Invalid ping payload');
      }
      const matched = request.version === SHARED_CONTRACT_VERSION;
      if (!matched) {
        getLogger('ipc').warn('contract drift detected', {
          expected: SHARED_CONTRACT_VERSION,
          received: request.version,
        });
      }
      return { version: SHARED_CONTRACT_VERSION, matched };
    }
  );
}

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

export type IpcHandlersOptions = {
  cpuMonitor?: CpuMonitor;
  systemInfoMonitor?: SystemInfoMonitor;
  gpuMonitor?: GpuMonitor;
  scheduler?: LiveScheduler | null;
};

export function registerIpcHandlers(options: IpcHandlersOptions = {}): void {
  const cpuMonitor = options.cpuMonitor ?? new CpuMonitor();
  const systemInfoMonitor = options.systemInfoMonitor ?? new SystemInfoMonitor();
  const gpuMonitor = options.gpuMonitor ?? new GpuMonitor();
  ipcMain.handle(IPC_CHANNELS.ping, createPingHandler());
  ipcMain.handle(IPC_CHANNELS.reportRendererError, createReportRendererErrorHandler());
  registerCpuIpc(cpuMonitor);
  registerSystemInfoIpc(systemInfoMonitor);
  registerGpuIpc(gpuMonitor);
  if (options.scheduler) {
    registerLiveIpc(options.scheduler);
  }
}
