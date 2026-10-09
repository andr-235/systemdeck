import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { CLEANER_RULES } from '../cleaner/rules';
import { CleanerManager } from '../cleaner/CleanerManager';
import type { CleanerDirEntry, CleanerFs } from '../cleaner/walker';
import {
  createCleanerCancelHandler,
  createCleanerDeleteHandler,
  createCleanerPreviewHandler,
  registerCleanerIpc,
} from './cleaner';
import { __clearIpcRateMapForTests } from './index';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

const userRoot = CLEANER_RULES.find((rule) => rule.category === 'user-temp')!.allowRoot;

function fileEntry(name: string): CleanerDirEntry {
  return {
    name,
    isDirectory: () => false,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
}

const previewFs: CleanerFs = {
  readdir: async () => [fileEntry('a.tmp')],
  stat: async () => ({ size: 10, isFile: () => true }),
};

function createManager(): CleanerManager {
  return new CleanerManager({
    send: () => undefined,
    throttleMs: 0,
    previewFs,
    deleteFs: {
      lstat: async () => ({ size: 10, isFile: () => true, isSymbolicLink: () => false }),
      unlink: async () => undefined,
    },
  });
}

const event = {} as Electron.IpcMainInvokeEvent;

beforeEach(() => {
  __clearIpcRateMapForTests();
  vi.clearAllMocks();
});

describe('cleaner IPC handlers', () => {
  it('registers all cleaner channels', () => {
    registerCleanerIpc(createManager());
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.cleanerPreview, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.cleanerDelete, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.cleanerCancel, expect.any(Function));
  });

  it('rejects an empty or malformed category list', async () => {
    const handler = createCleanerPreviewHandler(createManager());
    for (const request of [{}, { categories: [] }, { categories: ['not-a-category'] }]) {
      const result = await handler(event, request as never);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(IPC_ERROR_CODES.VALIDATION_FAILED);
        expect(result.error).not.toHaveProperty('stack');
      }
    }
  });

  it('builds a preview session for a valid category list', async () => {
    const handler = createCleanerPreviewHandler(createManager());
    const result = await handler(event, { categories: ['user-temp'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.sessionId).toBeTruthy();
      expect(result.data.candidates[0].path.startsWith(userRoot)).toBe(true);
      expect(result.data.candidates[0].id).not.toBe(result.data.sessionId);
    }
  });

  it('deduplicates repeated category ids before walking', async () => {
    const manager = createManager();
    const preview = vi.spyOn(manager, 'preview');
    const handler = createCleanerPreviewHandler(manager);
    const result = await handler(event, { categories: ['user-temp', 'user-temp'] });
    expect(result.ok).toBe(true);
    expect(preview).toHaveBeenCalledWith(['user-temp']);
  });

  it('never reads a raw path from a delete request', async () => {
    const manager = createManager();
    const startDelete = vi.spyOn(manager, 'startDelete');
    const handler = createCleanerDeleteHandler(manager);
    const result = await handler(event, {
      path: 'C:\\Users\\alice\\photo.jpg',
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(IPC_ERROR_CODES.VALIDATION_FAILED);
    }
    expect(startDelete).not.toHaveBeenCalled();
  });

  it('maps an unknown session to a controlled cleaner error', async () => {
    const handler = createCleanerDeleteHandler(createManager());
    const result = await handler(event, { sessionId: 'nope', candidateIds: ['x'] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(IPC_ERROR_CODES.CLEAN_SESSION_NOT_FOUND);
      expect(result.error).not.toHaveProperty('stack');
    }
  });

  it('validates the cancel payload and accepts a well-formed one', async () => {
    const handler = createCleanerCancelHandler(createManager());
    const invalid = await handler(event, {} as never);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.code).toBe(IPC_ERROR_CODES.VALIDATION_FAILED);
    }
    const valid = await handler(event, { operationId: 'op-1' });
    expect(valid.ok).toBe(true);
  });
});
