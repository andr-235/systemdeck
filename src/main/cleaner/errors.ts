import { IPC_ERROR_CODES, toErrorParts, type IpcError } from '@shared/ipc/errors';
import { getLogger } from '../logger';

/** Код системной ошибки Node fs (EBUSY, EPERM…): отсутствие кода — undefined. */
export function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/** IPC Error без stack/cause; полный текст — только в Application Log Main. */
export function toCleanupIpcError(
  error: unknown,
  code: string = IPC_ERROR_CODES.CLEAN_DELETE_FAILED
): IpcError {
  getLogger('cleaner').error('cleaner operation failed', { code, error: toErrorParts(error) });
  const message = error instanceof Error ? error.message : String(error);
  return { code, message };
}
