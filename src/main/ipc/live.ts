import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { IpcRequest, IpcResponse } from '@shared/ipc/contracts';
import type { IpcResult } from '@shared/ipc/errors';
import { withSafeHandler } from './index';
import { DEFAULT_INTERVAL_MS, type LiveScheduler } from '../monitoring/live/LiveScheduler';

type SubscribeChannel = typeof IPC_CHANNELS.liveSubscribe;
type UnsubscribeChannel = typeof IPC_CHANNELS.liveUnsubscribe;

export function createLiveSubscribeHandler(
  scheduler: LiveScheduler
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<SubscribeChannel>
) => Promise<IpcResult<IpcResponse<SubscribeChannel>>> {
  return withSafeHandler<IpcRequest<SubscribeChannel>, IpcResponse<SubscribeChannel>>(
    IPC_CHANNELS.liveSubscribe,
    async (request) => {
      // Дефолт 1000 мс (ADR 0008): отсутствующий/некорректный интервал → дефолт,
      // корректный но вне диапазона [500, 5000] — клампится планировщиком.
      const rawInterval = request?.intervalMs;
      const intervalMs = scheduler.validateInterval(
        typeof rawInterval === 'number' && Number.isFinite(rawInterval)
          ? rawInterval
          : DEFAULT_INTERVAL_MS
      );
      scheduler.subscribe(intervalMs);
      scheduler.startProcessLoop();
      return { intervalMs };
    }
  );
}

export function createLiveUnsubscribeHandler(
  scheduler: LiveScheduler
): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<UnsubscribeChannel>
) => Promise<IpcResult<IpcResponse<UnsubscribeChannel>>> {
  return withSafeHandler<IpcRequest<UnsubscribeChannel>, IpcResponse<UnsubscribeChannel>>(
    IPC_CHANNELS.liveUnsubscribe,
    async () => {
      scheduler.unsubscribe();
      return undefined;
    }
  );
}

export function registerLiveIpc(scheduler: LiveScheduler): void {
  ipcMain.handle(IPC_CHANNELS.liveSubscribe, createLiveSubscribeHandler(scheduler));
  ipcMain.handle(IPC_CHANNELS.liveUnsubscribe, createLiveUnsubscribeHandler(scheduler));
}
