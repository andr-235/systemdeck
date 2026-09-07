import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { SHARED_CONTRACT_VERSION } from '@shared/api'
import type { IpcRequest, IpcResponse } from '@shared/ipc/contracts'
import { ipcFailure, ipcSuccess, type IpcResult } from '@shared/ipc/errors'

const IPC_RATE_LIMIT_WINDOW_MS = 1000
const IPC_RATE_LIMIT_MAX = 20
const ipcRateMap = new Map<string, number[]>()

function isRateLimited(channel: string): boolean {
  const now = Date.now()
  const hits = ipcRateMap.get(channel) ?? []
  const recent = hits.filter((t) => now - t < IPC_RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  ipcRateMap.set(channel, recent)
  return recent.length > IPC_RATE_LIMIT_MAX
}

function withSafeHandler<TReq, TRes>(
  channel: string,
  handler: (request: TReq) => Promise<TRes> | TRes
): (event: Electron.IpcMainInvokeEvent, request: TReq) => Promise<IpcResult<TRes>> {
  return async (_event, request) => {
    if (isRateLimited(channel)) {
      return ipcFailure({ code: 'RATE_LIMITED', message: 'Too many requests' })
    }
    try {
      const data = await handler(request)
      return ipcSuccess(data)
    } catch (error) {
      console.error(`[ipc:${channel}]`, error)
      return ipcFailure(error)
    }
  }
}

type PingChannel = typeof IPC_CHANNELS.ping

function createPingHandler(): (
  event: Electron.IpcMainInvokeEvent,
  request: IpcRequest<PingChannel>
) => Promise<IpcResult<IpcResponse<PingChannel>>> {
  return withSafeHandler<IpcRequest<PingChannel>, IpcResponse<PingChannel>>(
    IPC_CHANNELS.ping,
    async (request) => {
      // Validation: PingRequest must be void/undefined — reject any payload (future-proof)
      if (request !== undefined && request !== null) {
        throw new Error('Invalid ping payload')
      }
      return {
        pong: true as const,
        contractVersion: SHARED_CONTRACT_VERSION,
        timestamp: Date.now()
      }
    }
  )
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ping, createPingHandler())
}
