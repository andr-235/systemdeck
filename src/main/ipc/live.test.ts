import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

import { createLiveSubscribeHandler, createLiveUnsubscribeHandler } from './live';

function makeScheduler(): {
  validateInterval: (v: number) => number;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  startProcessLoop: ReturnType<typeof vi.fn>;
} {
  return {
    validateInterval: (v: number) => Math.min(5000, Math.max(500, Math.round(v))),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    startProcessLoop: vi.fn(),
  };
}

describe('Main IPC — live handlers (node project)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('live:subscribe uses 1000 ms default when intervalMs is missing', async () => {
    const scheduler = makeScheduler();
    const handler = createLiveSubscribeHandler(scheduler as never);
    const result = await handler({} as Electron.IpcMainInvokeEvent, {} as { intervalMs?: number });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ intervalMs: 1000 });
    expect(scheduler.subscribe).toHaveBeenCalledWith(1000);
    expect(scheduler.startProcessLoop).toHaveBeenCalled();
  });

  it('live:subscribe clamps out-of-range interval to [500, 5000]', async () => {
    const scheduler = makeScheduler();
    const handler = createLiveSubscribeHandler(scheduler as never);

    const tooFast = await handler({} as Electron.IpcMainInvokeEvent, { intervalMs: 50 });
    expect(tooFast.ok).toBe(true);

    const tooSlow = await handler({} as Electron.IpcMainInvokeEvent, { intervalMs: 10_000 });
    expect(tooSlow.ok).toBe(true);

    expect(scheduler.subscribe).toHaveBeenNthCalledWith(1, 500);
    expect(scheduler.subscribe).toHaveBeenNthCalledWith(2, 5000);
  });

  it('live:unsubscribe delegates to scheduler without payload', async () => {
    const scheduler = makeScheduler();
    const handler = createLiveUnsubscribeHandler(scheduler as never);
    await handler({} as Electron.IpcMainInvokeEvent, undefined);

    expect(scheduler.unsubscribe).toHaveBeenCalled();
  });
});
