import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc/channels'
import { SHARED_CONTRACT_VERSION } from '../../shared/api'
import type { PingResponse } from '../../shared/ipc/contracts'
import { ipcFailure, ipcSuccess, type IpcResult } from '../../shared/ipc/errors'

function withSafeHandler<T>(handler: () => Promise<T> | T): () => Promise<IpcResult<T>> {
  return async () => {
    try {
      const data = await handler()
      return ipcSuccess(data)
    } catch (error) {
      console.error('[ipc]', error)
      return ipcFailure(error)
    }
  }
}

function createPingHandler(): () => Promise<IpcResult<PingResponse>> {
  return withSafeHandler<PingResponse>(async () => ({
    pong: true as const,
    contractVersion: SHARED_CONTRACT_VERSION,
    timestamp: Date.now()
  }))
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ping, createPingHandler())
}
