export const IPC_ERROR_CODES = {
  UNKNOWN: 'UNKNOWN',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
  PROCESS_PROTECTED: 'PROCESS_PROTECTED',
  PROCESS_NOT_FOUND: 'PROCESS_NOT_FOUND',
  SCAN_ALREADY_ACTIVE: 'SCAN_ALREADY_ACTIVE',
  SCAN_NOT_ACTIVE: 'SCAN_NOT_ACTIVE',
  CLEAN_PROTECTED_PATH: 'CLEAN_PROTECTED_PATH',
  CLEAN_OUTSIDE_RULES: 'CLEAN_OUTSIDE_RULES',
  CLEAN_DELETE_FAILED: 'CLEAN_DELETE_FAILED',
  CLEAN_ALREADY_ACTIVE: 'CLEAN_ALREADY_ACTIVE',
  CLEAN_SESSION_NOT_FOUND: 'CLEAN_SESSION_NOT_FOUND',
  CLEAN_UNKNOWN_CANDIDATE: 'CLEAN_UNKNOWN_CANDIDATE',
  CLEAN_EMPTY_SELECTION: 'CLEAN_EMPTY_SELECTION',
  /** Запись изменилась после preview: исчезла, стала ссылкой или не файл. */
  CLEAN_ENTRY_INVALID: 'CLEAN_ENTRY_INVALID',
  /** Shell-механизм корзины недоступен: нет PowerShell, прав или сбой запроса (issue #57). */
  CLEAN_SHELL_UNAVAILABLE: 'CLEAN_SHELL_UNAVAILABLE',
  /** Файл занят другим процессом: пропуск, без ошибки и автоперезапуска (issue #57). */
  CLEAN_FILE_IN_USE: 'CLEAN_FILE_IN_USE',
  /** Операция выполнена, но фактический размер не подтверждён — без оценочных байтов. */
  CLEAN_SIZE_UNVERIFIED: 'CLEAN_SIZE_UNVERIFIED',
} as const;

export type IpcErrorCode = (typeof IPC_ERROR_CODES)[keyof typeof IPC_ERROR_CODES];

export type IpcError = {
  code: string;
  message: string;
};

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export function isIpcError(value: unknown): value is IpcError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as Record<string, unknown>).code === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string'
  );
}

export function toIpcError(error: unknown): IpcError {
  if (isIpcError(error)) {
    const e = error as IpcError;
    return { code: String(e.code), message: String(e.message) };
  }
  if (error instanceof Error) {
    return {
      code: IPC_ERROR_CODES.INTERNAL,
      message: error.message || 'Unknown error',
    };
  }
  return {
    code: IPC_ERROR_CODES.INTERNAL,
    message: String(error),
  };
}

export function toErrorParts(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack ?? undefined };
  }
  return { message: String(value) };
}

export function ipcSuccess<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function ipcFailure<T>(error: unknown): IpcResult<T> {
  return { ok: false, error: toIpcError(error) };
}
