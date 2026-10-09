import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CleanupProgressEvent, CleanerPreviewResponse } from '@shared/ipc/contracts';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { CLEANUP_SESSION_TTL_MS } from './previewSession';
import { CLEANER_RULES } from './rules';
import type { CleanerDeleteFs } from './deleter';
import type { CleanerDirEntry, CleanerFs } from './walker';

vi.mock('./candidates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./candidates')>();
  return { ...actual, isDeletionAllowed: vi.fn(actual.isDeletionAllowed) };
});

import { isDeletionAllowed } from './candidates';
import { CleanerManager } from './CleanerManager';

const userRoot = CLEANER_RULES.find((rule) => rule.category === 'user-temp')!.allowRoot;
const aPath = `${userRoot}\\a.tmp`;
const bPath = `${userRoot}\\b.tmp`;

type TerminalEvent = Extract<
  CleanupProgressEvent,
  { status: 'completed' | 'cancelled' | 'failed' }
>;

function isTerminal(event: CleanupProgressEvent): event is TerminalEvent {
  return event.status !== 'running';
}

function fileEntry(name: string): CleanerDirEntry {
  return {
    name,
    isDirectory: () => false,
    isFile: () => true,
    isSymbolicLink: () => false,
  };
}

function previewFsStub(): CleanerFs {
  return {
    readdir: async () => [fileEntry('a.tmp'), fileEntry('b.tmp')],
    stat: async (path) => ({ size: path === aPath ? 10 : 20, isFile: () => true }),
  };
}

type DeleteStubOptions = { errors?: Record<string, string> };

function deleteFsStub(options: DeleteStubOptions = {}): {
  fs: CleanerDeleteFs;
  unlinked: string[];
} {
  const sizes: Record<string, number> = { [aPath]: 10, [bPath]: 20 };
  const unlinked: string[] = [];
  return {
    unlinked,
    fs: {
      lstat: async (path) => {
        if (!(path in sizes)) {
          throw new Error('ENOENT');
        }
        return { size: sizes[path], isFile: () => true, isSymbolicLink: () => false };
      },
      unlink: async (path) => {
        const error = options.errors?.[path];
        if (error) {
          throw new Error(error);
        }
        unlinked.push(path);
      },
    },
  };
}

type DeleteControl = {
  fs: CleanerDeleteFs;
  unlinked: string[];
  started: Promise<void>;
  release: () => void;
};

/** Первый unlink блокируется до release: управляет таймингом для concurrency-тестов. */
function gatedDeleteFs(): DeleteControl {
  const sizes: Record<string, number> = { [aPath]: 10, [bPath]: 20 };
  const unlinked: string[] = [];
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let firstCall = true;
  return {
    unlinked,
    started,
    release: () => releaseGate(),
    fs: {
      lstat: async (path) => {
        if (!(path in sizes)) {
          throw new Error('ENOENT');
        }
        return { size: sizes[path], isFile: () => true, isSymbolicLink: () => false };
      },
      unlink: async (path) => {
        if (firstCall) {
          firstCall = false;
          markStarted();
          await gate;
        }
        unlinked.push(path);
      },
    },
  };
}

type ManagerHarness = {
  manager: CleanerManager;
  events: CleanupProgressEvent[];
  preview: CleanerPreviewResponse;
};

async function setupManager(
  deleteFs: CleanerDeleteFs,
  extra: Partial<ConstructorParameters<typeof CleanerManager>[0]> = {}
): Promise<ManagerHarness> {
  const events: CleanupProgressEvent[] = [];
  const manager = new CleanerManager({
    send: (event) => events.push(event),
    throttleMs: 0,
    previewFs: previewFsStub(),
    deleteFs,
    ...extra,
  });
  const preview = await manager.preview(['user-temp']);
  return { manager, events, preview };
}

async function waitForTerminal(events: CleanupProgressEvent[]): Promise<TerminalEvent> {
  await vi.waitFor(() => {
    if (!events.some(isTerminal)) {
      throw new Error('terminal event is not delivered yet');
    }
  });
  return events.find(isTerminal)!;
}

function expectIpcCode(run: () => unknown, code: string): void {
  let thrown: unknown = null;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).not.toBeNull();
  expect((thrown as { code?: string }).code).toBe(code);
}

function selectedIds(preview: CleanerPreviewResponse): string[] {
  return preview.candidates.map((candidate) => candidate.id);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cleaner manager', () => {
  it('runs a single deletion cycle and emits one correlated terminal event', async () => {
    const { fs, unlinked } = deleteFsStub();
    const { manager, events, preview } = await setupManager(fs);
    const { operationId } = manager.startDelete({
      sessionId: preview.sessionId,
      candidateIds: selectedIds(preview),
    });
    const terminal = await waitForTerminal(events);
    expect(terminal).toMatchObject({ operationId, status: 'completed' });
    expect(terminal.report).toMatchObject({
      total: 2,
      deleted: 2,
      skipped: 0,
      failed: 0,
      freedBytes: 30,
    });
    expect(events.every((event) => event.operationId === operationId)).toBe(true);
    expect(events.filter(isTerminal)).toHaveLength(1);
    expect(unlinked.sort()).toEqual([aPath, bPath].sort());
    expect(manager.isActive()).toBe(false);
  });

  it('rejects concurrent delete and preview while an operation is active', async () => {
    const control = gatedDeleteFs();
    const { manager, events, preview } = await setupManager(control.fs);
    const { operationId } = manager.startDelete({
      sessionId: preview.sessionId,
      candidateIds: selectedIds(preview),
    });
    await control.started;
    expectIpcCode(
      () =>
        manager.startDelete({ sessionId: preview.sessionId, candidateIds: selectedIds(preview) }),
      IPC_ERROR_CODES.CLEAN_ALREADY_ACTIVE
    );
    await expect(manager.preview(['user-temp'])).rejects.toMatchObject({
      code: IPC_ERROR_CODES.CLEAN_ALREADY_ACTIVE,
    });
    control.release();
    const terminal = await waitForTerminal(events);
    expect(terminal.operationId).toBe(operationId);
    expect(terminal.status).toBe('completed');
    // После завершения операции следующий запуск проходит.
    const next = manager.startDelete({
      sessionId: preview.sessionId,
      candidateIds: selectedIds(preview),
    });
    expect(next.operationId).not.toBe(operationId);
    await vi.waitFor(() => {
      expect(events.filter(isTerminal)).toHaveLength(2);
    });
  });

  it('cancels remaining work; repeated or foreign cancels are safe no-ops', async () => {
    const control = gatedDeleteFs();
    const { manager, events, preview } = await setupManager(control.fs);
    const { operationId } = manager.startDelete({
      sessionId: preview.sessionId,
      candidateIds: selectedIds(preview),
    });
    await control.started;
    manager.cancel('foreign-operation');
    manager.cancel(operationId);
    manager.cancel(operationId);
    control.release();
    const terminal = await waitForTerminal(events);
    expect(terminal.operationId).toBe(operationId);
    expect(terminal.status).toBe('cancelled');
    // Уже удалённое не откатывается: первый элемент в отчёте, второй не начинался.
    expect(terminal.report).toMatchObject({ total: 1, deleted: 1, freedBytes: 10 });
    expect(control.unlinked).toEqual([aPath]);
    expect(manager.isActive()).toBe(false);
  });

  it('validates session and selection before starting an operation', async () => {
    const { fs, unlinked } = deleteFsStub();
    const { manager, preview } = await setupManager(fs);
    expectIpcCode(
      () => manager.startDelete({ sessionId: 'nope', candidateIds: ['x'] }),
      IPC_ERROR_CODES.CLEAN_SESSION_NOT_FOUND
    );
    expectIpcCode(
      () => manager.startDelete({ sessionId: preview.sessionId, candidateIds: [] }),
      IPC_ERROR_CODES.CLEAN_EMPTY_SELECTION
    );
    expectIpcCode(
      () =>
        manager.startDelete({
          sessionId: preview.sessionId,
          candidateIds: ['foreign-session:candidate'],
        }),
      IPC_ERROR_CODES.CLEAN_UNKNOWN_CANDIDATE
    );
    expect(manager.isActive()).toBe(false);
    expect(unlinked).toEqual([]);
  });

  it('rejects a delete by an expired preview session', async () => {
    let nowMs = 0;
    const events: CleanupProgressEvent[] = [];
    const manager = new CleanerManager({
      send: (event) => events.push(event),
      throttleMs: 0,
      now: () => nowMs,
      previewFs: previewFsStub(),
      deleteFs: deleteFsStub().fs,
    });
    const preview = await manager.preview(['user-temp']);
    nowMs = CLEANUP_SESSION_TTL_MS + 1;
    expectIpcCode(
      () =>
        manager.startDelete({
          sessionId: preview.sessionId,
          candidateIds: selectedIds(preview),
        }),
      IPC_ERROR_CODES.CLEAN_SESSION_NOT_FOUND
    );
    expect(manager.isActive()).toBe(false);
  });

  it('rejects a delete up-front when a candidate fails the deletion guard', async () => {
    const { fs, unlinked } = deleteFsStub();
    const { manager, preview } = await setupManager(fs);
    vi.mocked(isDeletionAllowed).mockReturnValueOnce({
      allowed: false,
      code: IPC_ERROR_CODES.CLEAN_PROTECTED_PATH,
    });
    expectIpcCode(
      () =>
        manager.startDelete({ sessionId: preview.sessionId, candidateIds: selectedIds(preview) }),
      IPC_ERROR_CODES.CLEAN_PROTECTED_PATH
    );
    expect(manager.isActive()).toBe(false);
    expect(unlinked).toEqual([]);
  });

  it('keeps the terminal event even when running progress is heavily throttled', async () => {
    const { fs } = deleteFsStub();
    const events: CleanupProgressEvent[] = [];
    const manager = new CleanerManager({
      send: (event) => events.push(event),
      throttleMs: 60_000,
      previewFs: previewFsStub(),
      deleteFs: fs,
    });
    const preview = await manager.preview(['user-temp']);
    manager.startDelete({ sessionId: preview.sessionId, candidateIds: selectedIds(preview) });
    const terminal = await waitForTerminal(events);
    expect(events[0]).toMatchObject({ status: 'running', phase: 'validating' });
    expect(events.filter(isTerminal)).toHaveLength(1);
    expect(terminal.status).toBe('completed');
  });

  it('shows a partial failure instead of a full success', async () => {
    const { fs } = deleteFsStub({ errors: { [aPath]: 'EPERM' } });
    const { manager, events, preview } = await setupManager(fs);
    manager.startDelete({ sessionId: preview.sessionId, candidateIds: selectedIds(preview) });
    const terminal = await waitForTerminal(events);
    expect(terminal.status).toBe('completed');
    expect(terminal.report).toMatchObject({ deleted: 1, failed: 1, freedBytes: 20 });
  });

  it('keeps a failing progress sink from breaking the operation', async () => {
    const { fs, unlinked } = deleteFsStub();
    const manager = new CleanerManager({
      // Имитация webContents.send при закрытии окна: send бросает на каждом событии.
      send: () => {
        throw new Error('Object has been destroyed');
      },
      throttleMs: 0,
      previewFs: previewFsStub(),
      deleteFs: fs,
    });
    const preview = await manager.preview(['user-temp']);
    manager.startDelete({ sessionId: preview.sessionId, candidateIds: selectedIds(preview) });
    // Ни unhandled rejection (упал бы прогон vitest), ни зависшей активной операции.
    await vi.waitFor(() => expect(manager.isActive()).toBe(false));
    expect(unlinked.sort()).toEqual([aPath, bPath].sort());
  });

  it('keeps events of a finished operation from being attributed to the next run', async () => {
    const { fs } = deleteFsStub();
    const { manager, events, preview } = await setupManager(fs);
    const first = manager.startDelete({
      sessionId: preview.sessionId,
      candidateIds: selectedIds(preview),
    });
    await waitForTerminal(events);
    const second = manager.startDelete({
      sessionId: preview.sessionId,
      candidateIds: selectedIds(preview),
    });
    await vi.waitFor(() => {
      expect(events.filter(isTerminal)).toHaveLength(2);
    });
    expect(second.operationId).not.toBe(first.operationId);
    const firstEvents = events.filter((event) => event.operationId === first.operationId);
    const secondEvents = events.filter((event) => event.operationId === second.operationId);
    expect(firstEvents.filter(isTerminal)).toHaveLength(1);
    expect(secondEvents.filter(isTerminal)).toHaveLength(1);
    expect(firstEvents.length + secondEvents.length).toBe(events.length);
  });
});
