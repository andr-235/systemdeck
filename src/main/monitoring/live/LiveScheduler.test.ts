import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LiveScheduler,
  MIN_INTERVAL_MS,
  MAX_INTERVAL_MS,
  type LiveSchedulerOptions,
} from './LiveScheduler';
import type { LiveSnapshot, ProcessSnapshot } from '@shared/ipc';

function makeFakeWindow(): { webContents: { send: ReturnType<typeof vi.fn> } } {
  return {
    webContents: {
      send: vi.fn(),
    },
  };
}

function makeStubMonitors(): LiveSchedulerOptions {
  return {
    cpu: {
      getLive: vi.fn(() => ({ overall: 10, perCore: [10] })),
      getInfo: vi.fn(),
    } as never,
    memory: {
      readMemoryWithSwap: vi.fn(async () => ({
        total: 16000,
        used: 4000,
        available: 12000,
        percent: 25,
        swap: null,
      })),
    } as never,
    disks: {
      read: vi.fn(async () => []),
    } as never,
    network: {
      read: vi.fn(async () => []),
    } as never,
    gpu: {
      getLive: vi.fn(async () => [{ utilization: 5 }]),
      getInfo: vi.fn(),
    } as never,
    temperatures: {
      getLive: vi.fn(async () => []),
    } as never,
    processes: {
      read: vi.fn(async () => ({ timestamp: 0, processes: [] }) as ProcessSnapshot),
    } as never,
  };
}

function makeScheduler(): {
  scheduler: LiveScheduler;
  send: ReturnType<typeof vi.fn>;
} {
  const fakeWin = makeFakeWindow();
  const scheduler = new LiveScheduler({
    window: fakeWin as unknown as Electron.BrowserWindow,
    ...makeStubMonitors(),
  });
  return { scheduler, send: fakeWin.webContents.send };
}

const LIVE_CHANNEL = 'systemdeck:push:live:snapshot';
const PROCESS_CHANNEL = 'systemdeck:push:process:snapshot';

describe('LiveScheduler (node project)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('constructor requires a window', () => {
    expect(() => new LiveScheduler({})).toThrow('LiveScheduler: window required');
  });

  it('validateInterval clamps to [500, 5000] and rounds', () => {
    const { scheduler } = makeScheduler();
    expect(scheduler.validateInterval(100)).toBe(MIN_INTERVAL_MS);
    expect(scheduler.validateInterval(10_000)).toBe(MAX_INTERVAL_MS);
    expect(scheduler.validateInterval(1234)).toBe(1234);
    expect(scheduler.validateInterval(NaN)).toBe(1000);
  });

  it('subscribe starts running and pushes a LiveSnapshot on tick', async () => {
    vi.useRealTimers();
    const { scheduler, send } = makeScheduler();
    scheduler.subscribe(1000);
    expect(scheduler.isRunningForTest()).toBe(true);

    const liveCalls = (): [string, LiveSnapshot][] =>
      send.mock.calls.filter(([channel]) => channel === LIVE_CHANNEL) as [string, LiveSnapshot][];

    await vi.waitFor(() => {
      expect(liveCalls().length).toBeGreaterThan(0);
    });
    const [, payload] = liveCalls()[0];
    expect(payload).toMatchObject({
      timestamp: expect.any(Number),
      cpu: { overall: 10, perCore: [10] },
      memory: { total: 16000, percent: 25 },
      disks: [],
      network: [],
      gpu: [{ utilization: 5 }],
      temperatures: [],
    });

    await scheduler.dispose();
  });

  it('subscribe also starts the slow process loop', async () => {
    vi.useRealTimers();
    const { scheduler, send } = makeScheduler();
    scheduler.subscribe(1000);

    await vi.waitFor(() => {
      expect(send.mock.calls.some(([channel]) => channel === PROCESS_CHANNEL)).toBe(true);
    });

    await scheduler.dispose();
  });

  it('unsubscribe stops ticking (no further sends)', async () => {
    vi.useRealTimers();
    const { scheduler, send } = makeScheduler();
    scheduler.subscribe(1000);
    const liveCalls = (): number =>
      send.mock.calls.filter(([channel]) => channel === LIVE_CHANNEL).length;
    await vi.waitFor(() => expect(liveCalls()).toBeGreaterThan(0));
    scheduler.unsubscribe();
    expect(scheduler.isRunningForTest()).toBe(false);

    const countBefore = liveCalls();
    await new Promise((r) => setTimeout(r, 2100));
    expect(liveCalls()).toBe(countBefore);

    await scheduler.dispose();
  });

  it('setWindowVisible(false) pauses; true resumes live tick and process loop', async () => {
    vi.useRealTimers();
    const { scheduler, send } = makeScheduler();
    scheduler.subscribe(1000);
    const liveCalls = (): number =>
      send.mock.calls.filter(([channel]) => channel === LIVE_CHANNEL).length;
    const processCalls = (): number =>
      send.mock.calls.filter(([channel]) => channel === PROCESS_CHANNEL).length;

    await vi.waitFor(() => expect(liveCalls()).toBeGreaterThan(0));

    scheduler.setWindowVisible(false);
    expect(scheduler.isRunningForTest()).toBe(false);
    const liveAfterHide = liveCalls();
    const processesAfterHide = processCalls();
    await new Promise((r) => setTimeout(r, 2100));
    expect(liveCalls()).toBe(liveAfterHide);
    expect(processCalls()).toBe(processesAfterHide);

    scheduler.setWindowVisible(true);
    await vi.waitFor(() => expect(liveCalls()).toBeGreaterThan(liveAfterHide));
    // медленный цикл процессов перезапускается после скрытия окна (ADR 0008)
    await vi.waitFor(() => expect(processCalls()).toBeGreaterThan(processesAfterHide));

    await scheduler.dispose();
  });
});
