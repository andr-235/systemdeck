import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { SHARED_CONTRACT_VERSION } from '@shared/api'
import type { IpcRequest, IpcResponse } from '@shared/ipc/contracts'
import { ipcFailure, ipcSuccess, type IpcResult } from '@shared/ipc/errors'

function withSafeHandler<TReq, TRes>(
  handler: (request: TReq) => Promise<TRes> | TRes
): (event: Electron.IpcMainInvokeEvent, request: TReq) => Promise<IpcResult<TRes>> {
  return async (_event, request) => {
    try {
      const data = await handler(request)
      return ipcSuccess(data)
    } catch (error) {
      console.error('[ipc]', error)
      return ipcFailure(error)
    }
  }
}

type PingChannel = typeof IPC_CHANNELS.ping

function createPingHandler(): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<PingChannel>
) => Promise<IpcResult<IpcResponse<PingChannel>>> {
  return withSafeHandler<IpcRequest<PingChannel>, IpcResponse<PingChannel>>(async () => ({
    pong: true as const,
    contractVersion: SHARED_CONTRACT_VERSION,
    timestamp: Date.now()
  }))
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ping, createPingHandler())
}
