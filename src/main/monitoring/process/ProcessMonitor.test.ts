import { describe, it, expect } from 'vitest';
import { toProcessEntry, parseCimDateTime, type ProcessRow } from './ProcessMonitor';

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
      memBytes: 1048576,
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
    expect(entry.memBytes).toBe(0);
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
