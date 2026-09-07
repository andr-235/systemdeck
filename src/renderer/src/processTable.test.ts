import { describe, it, expect } from 'vitest';
import { filterProcesses, sortProcesses, findProcessById } from './processTable';
import { makeProcessEntry, makeProcessSnapshot } from './test-utils';

const rows = [
  makeProcessEntry({ pid: 3, name: 'webkit.exe', cpuPercent: 50, memBytes: 2048 }),
  makeProcessEntry({ pid: 1, name: 'svchost.exe', cpuPercent: 5, memBytes: 512, protected: true }),
  makeProcessEntry({ pid: 2, name: 'chrome.exe', cpuPercent: 80, memBytes: 1024 }),
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

describe('findProcessById', () => {
  const snapshot = makeProcessSnapshot({ processes: rows });

  it('returns the entry for a matching pid', () => {
    expect(findProcessById(snapshot, 2)?.name).toBe('chrome.exe');
  });

  it('returns null for a missing pid', () => {
    expect(findProcessById(snapshot, 999)).toBeNull();
  });

  it('returns null for null snapshot or null pid', () => {
    expect(findProcessById(null, 1)).toBeNull();
    expect(findProcessById(snapshot, null)).toBeNull();
  });
});
