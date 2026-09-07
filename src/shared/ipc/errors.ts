export const IPC_ERROR_CODES = {
  UNKNOWN: 'UNKNOWN',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED'
} as const

export type IpcErrorCode = (typeof IPC_ERROR_CODES)[keyof typeof IPC_ERROR_CODES]

export type IpcError = {
  code: string
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

export function isIpcError(value: unknown): value is IpcError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as Record<string, unknown>).code === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string'
  )
}

export function toIpcError(error: unknown): IpcError {
  if (isIpcError(error)) {
    const e = error as IpcError
    return { code: String(e.code), message: String(e.message) }
  }
  if (error instanceof Error) {
    return {
      code: IPC_ERROR_CODES.UNKNOWN,
      message: error.message || 'Unknown error'
    }
  }
  return {
    code: IPC_ERROR_CODES.UNKNOWN,
    message: String(error)
  }
}

export function ipcSuccess<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

export function ipcFailure<T>(error: unknown): IpcResult<T> {
  return { ok: false, error: toIpcError(error) }
}
