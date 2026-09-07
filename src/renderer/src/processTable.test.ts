import { describe, it, expect } from 'vitest';
import { filterProcesses, sortProcesses } from './processTable';
import type { ProcessEntry } from '@shared/ipc';

function entry(overrides: Partial<ProcessEntry>): ProcessEntry {
  return {
    pid: 1,
    name: 'a.exe',
    cpuPercent: 0,
    memBytes: 1024,
    execPath: null,
    protected: false,
    commandLine: null,
    threadCount: 1,
    creationTime: null,
    parentPid: null,
    ...overrides,
  };
}

const rows = [
  entry({ pid: 3, name: 'webkit.exe', cpuPercent: 50, memBytes: 2048 }),
  entry({ pid: 1, name: 'svchost.exe', cpuPercent: 5, memBytes: 512, protected: true }),
  entry({ pid: 2, name: 'chrome.exe', cpuPercent: 80, memBytes: 1024 }),
];

describe('filterProcesses', () => {
  it('matches by name (case-insensitive substring)', () => {
    expect(filterProcesses(rows, 'chrome').map((p) => p.pid)).toEqual([2]);
    expect(filterProcesses(rows, 'EXE').length).toBe(3);
  });

  it('matches by pid', () => {
    expect(filterProcesses(rows, '1').map((p) => p.pid)).toEqual([1]);
  });

  it('returns all rows for empty/whitespace query', () => {
    expect(filterProcesses(rows, '').length).toBe(3);
    expect(filterProcesses(rows, '   ').length).toBe(3);
  });

  it('returns none when nothing matches', () => {
    expect(filterProcesses(rows, 'nomatch').length).toBe(0);
  });
});

describe('sortProcesses', () => {
  it('sorts by name ascending', () => {
    expect(sortProcesses(rows, 'name', 'asc').map((p) => p.name)).toEqual([
      'chrome.exe',
      'svchost.exe',
      'webkit.exe',
    ]);
  });

  it('sorts by name descending', () => {
    expect(sortProcesses(rows, 'name', 'desc').map((p) => p.name)).toEqual([
      'webkit.exe',
      'svchost.exe',
      'chrome.exe',
    ]);
  });

  it('sorts by cpuPercent descending', () => {
    expect(sortProcesses(rows, 'cpuPercent', 'desc').map((p) => p.pid)).toEqual([2, 3, 1]);
  });

  it('sorts by memBytes ascending', () => {
    expect(sortProcesses(rows, 'memBytes', 'asc').map((p) => p.pid)).toEqual([1, 2, 3]);
  });

  it('does not mutate input and is stable for equal keys', () => {
    const copy = [...rows];
    const out = sortProcesses(rows, 'pid', 'asc');
    expect(rows).toEqual(copy);
    expect(out[0].pid).toBe(1);
  });
});
