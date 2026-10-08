import { describe, expect, it } from 'vitest';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { toCleanupIpcError } from './errors';

describe('cleanup ipc errors', () => {
  it('serializes without stack or cause', () => {
    const failure = new Error('locked by another process');
    const serialized = toCleanupIpcError(failure);
    expect(serialized).toEqual({
      code: IPC_ERROR_CODES.CLEAN_DELETE_FAILED,
      message: 'locked by another process',
    });
    expect('stack' in serialized).toBe(false);
    expect('cause' in serialized).toBe(false);
  });

  it('keeps an explicit code and string messages', () => {
    expect(toCleanupIpcError('gone', IPC_ERROR_CODES.CLEAN_OUTSIDE_RULES)).toEqual({
      code: IPC_ERROR_CODES.CLEAN_OUTSIDE_RULES,
      message: 'gone',
    });
  });
});
