import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  toProcessEntry,
  toEntriesDelta,
  parseCimDateTime,
  ProcessMonitor,
  type ProcessRow,
} from './ProcessMonitor';

const baseRow = (overrides: Partial<ProcessRow> = {}): ProcessRow => ({
  ProcessId: 4242,
  Name: 'chrome.exe',
  ExecutablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  WorkingSetSize: 1048576,
  UserModeTime: 100,
  KernelModeTime: 50,
  CommandLine: 'chrome.exe --type=renderer',
  ThreadCount: 7,
  CreationDate: '20250101123456.000000+060',
  ParentProcessId: 1000,
  ...overrides,
});

describe('ProcessMonitor — toProcessEntry', () => {
  it('maps all enriched fields', () => {
    const entry = toProcessEntry(baseRow(), 12.5);
    expect(entry).toEqual({
      pid: 4242,
      name: 'chrome.exe',
      cpuPercent: 12.5,
      workingSetBytes: 1048576,
      execPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      protected: false,
      commandLine: 'chrome.exe --type=renderer',
      threadCount: 7,
      creationTime: expect.any(Number),
      parentPid: 1000,
    });
  });

  it('records protected process by name', () => {
    const entry = toProcessEntry(baseRow({ Name: 'lsass.exe' }), 0);
    expect(entry.protected).toBe(true);
  });

  it('treats null ExecutablePath and CommandLine as null (privileged/foreign)', () => {
    const entry = toProcessEntry(baseRow({ ExecutablePath: null, CommandLine: null }), 0);
    expect(entry.execPath).toBeNull();
    expect(entry.commandLine).toBeNull();
  });

  it('falls back to unknown name and 0 for missing numeric fields', () => {
    const entry = toProcessEntry(
      baseRow({ Name: null, ProcessId: null, ThreadCount: null, WorkingSetSize: null }),
      0
    );
    expect(entry.name).toBe('unknown');
    expect(entry.pid).toBe(0);
    expect(entry.threadCount).toBe(0);
    expect(entry.workingSetBytes).toBe(0);
  });
});

describe('parseCimDateTime', () => {
  it('parses CIM datetime to epoch ms', () => {
    const ms = parseCimDateTime('20250101123456.123456+060');
    // CIM-хвост +060 — смещение в минутах (+1 час): 12:34:56 local == 11:34:56 UTC
    expect(ms).toBe(Date.UTC(2025, 0, 1, 11, 34, 56));
  });

  it('parses negative CIM offset (e.g. -300 == UTC-5)', () => {
    const ms = parseCimDateTime('20250101123456.000000-300');
    // 12:34:56 local == 17:34:56 UTC
    expect(ms).toBe(Date.UTC(2025, 0, 1, 17, 34, 56));
  });

  it('returns null for null/blank/garbage input', () => {
    expect(parseCimDateTime(null)).toBeNull();
    expect(parseCimDateTime('')).toBeNull();
    expect(parseCimDateTime('not-a-date')).toBeNull();
  });
});

describe('ProcessMonitor — toEntriesDelta (ADR 0012)', () => {
  const prevRows = [
    baseRow({ ProcessId: 1, Name: 'a.exe', UserModeTime: 100, KernelModeTime: 50 }),
  ];

  it('computes cpuPercent from the tick delta over the elapsed window', () => {
    const curRows = [
      baseRow({ ProcessId: 1, Name: 'a.exe', UserModeTime: 500100, KernelModeTime: 50 }),
    ];
    const entries = toEntriesDelta(prevRows, curRows, 5000);
    // дельта = 500000 ед. по 100ns = 50 мс CPU за окно 5000 мс = 1% одного ядра
    expect(entries).toHaveLength(1);
    expect(entries[0].pid).toBe(1);
    expect(entries[0].cpuPercent).toBe(1);
  });

  it('excludes processes missing from the current sample (terminated)', () => {
    expect(toEntriesDelta(prevRows, [], 5000)).toEqual([]);
  });

  it('excludes processes missing from the previous sample (newly started)', () => {
    const curRows = [
      baseRow({ ProcessId: 1, Name: 'a.exe', UserModeTime: 200, KernelModeTime: 50 }),
      baseRow({ ProcessId: 2, Name: 'new.exe', UserModeTime: 10, KernelModeTime: 10 }),
    ];
    expect(toEntriesDelta(prevRows, curRows, 5000).map((e) => e.pid)).toEqual([1]);
  });

  it('marks tick regression as null CPU (Unavailable, never negative)', () => {
    const curRows = [
      baseRow({ ProcessId: 1, Name: 'a.exe', UserModeTime: 50, KernelModeTime: 50 }),
    ];
    expect(toEntriesDelta(prevRows, curRows, 5000)[0].cpuPercent).toBeNull();
  });

  it('guards a zero elapsed window (no division by zero)', () => {
    const curRows = [
      baseRow({ ProcessId: 1, Name: 'a.exe', UserModeTime: 500100, KernelModeTime: 50 }),
    ];
    expect(toEntriesDelta(prevRows, curRows, 0)[0].cpuPercent).toBeGreaterThan(0);
  });
});

describe('ProcessMonitor — cached sampling (ADR 0012)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('first read reports null CPU (no previous sample)', async () => {
    vi.setSystemTime(0);
    const rows = [baseRow({ UserModeTime: 100, KernelModeTime: 50 })];
    const monitor = new ProcessMonitor(async () => [...rows]);
    const snap = await monitor.read();
    expect(snap.processes).toHaveLength(1);
    expect(snap.processes[0].cpuPercent).toBeNull();
  });

  it('second read computes cpuPercent against the cached previous sample', async () => {
    vi.setSystemTime(0);
    const rows = [baseRow({ UserModeTime: 100, KernelModeTime: 50 })];
    const monitor = new ProcessMonitor(async () => [...rows]);
    await monitor.read();

    rows[0] = baseRow({ UserModeTime: 500100, KernelModeTime: 50 });
    vi.setSystemTime(5000);
    const snap = await monitor.read();
    expect(snap.processes[0].cpuPercent).toBe(1);
  });

  it('sorts entries by cpuPercent desc, then pid asc', async () => {
    const rows = [
      baseRow({ ProcessId: 2, Name: 'b.exe', UserModeTime: 500100, KernelModeTime: 50 }),
      baseRow({ ProcessId: 1, Name: 'a.exe', UserModeTime: 500100, KernelModeTime: 50 }),
    ];
    const monitor = new ProcessMonitor(async () => [...rows]);
    await monitor.read();
    vi.setSystemTime(5000);
    // дельта pid1 = 500000 (1%), дельта pid2 — без изменений (0%)
    rows[1] = baseRow({ ProcessId: 1, UserModeTime: 1000100, KernelModeTime: 50 });
    const snap = await monitor.read();
    expect(snap.processes.map((e) => e.pid)).toEqual([1, 2]);
  });

  it('falls back to an empty snapshot when the source fails', async () => {
    const monitor = new ProcessMonitor(async () => {
      throw new Error('wmi failed');
    });
    const snap = await monitor.read();
    expect(snap.processes).toEqual([]);
  });
});
