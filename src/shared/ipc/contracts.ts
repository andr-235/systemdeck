import { IPC_CHANNELS } from './channels'
import type { IpcResult } from './errors'

export type PingRequest = void

export type PingResponse = {
  pong: true
  contractVersion: string
  timestamp: number
}

export type IpcContracts = {
  [K in (typeof IPC_CHANNELS)['ping']]: {
    request: PingRequest
    response: PingResponse
  }
}

// Helper to extract request/response for a channel with full type-safety
export type IpcRequest<K extends keyof IpcContracts> = IpcContracts[K]['request']
export type IpcResponse<K extends keyof IpcContracts> = IpcContracts[K]['response']
export type IpcResultFor<K extends keyof IpcContracts> = IpcResult<IpcResponse<K>>
