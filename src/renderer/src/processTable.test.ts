import { describe, it, expect } from 'vitest';
import {
  filterProcesses,
  sortProcesses,
  sortGroups,
  groupProcesses,
  findProcessById,
} from './processTable';
import { makeProcessEntry, makeProcessSnapshot } from './test-utils';

const rows = [
  makeProcessEntry({ pid: 3, name: 'webkit.exe', cpuPercent: 50, workingSetBytes: 2048 }),
  makeProcessEntry({
    pid: 1,
    name: 'svchost.exe',
    cpuPercent: 5,
    workingSetBytes: 512,
    protected: true,
  }),
  makeProcessEntry({ pid: 2, name: 'chrome.exe', cpuPercent: 80, workingSetBytes: 1024 }),
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

  it('keeps entries without CPU (null) at the end when sorting by cpuPercent desc', () => {
    const withUnavailable = [
      ...rows,
      makeProcessEntry({ pid: 9, name: 'fresh.exe', cpuPercent: null }),
    ];
    expect(sortProcesses(withUnavailable, 'cpuPercent', 'desc').map((p) => p.pid)).toEqual([
      2, 3, 1, 9,
    ]);
  });

  it('sorts by workingSetBytes ascending', () => {
    expect(sortProcesses(rows, 'workingSetBytes', 'asc').map((p) => p.pid)).toEqual([1, 2, 3]);
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

describe('groupProcesses — grouping by application', () => {
  const grouped = [
    makeProcessEntry({
      pid: 1,
      name: 'chrome.exe',
      cpuPercent: 10,
      workingSetBytes: 100,
      execPath: 'C:\\chrome.exe',
    }),
    makeProcessEntry({
      pid: 2,
      name: 'chrome.exe',
      cpuPercent: 20,
      workingSetBytes: 300,
      execPath: 'C:\\chrome.exe',
    }),
    makeProcessEntry({
      pid: 3,
      name: 'notepad.exe',
      cpuPercent: 5,
      workingSetBytes: 50,
      execPath: 'C:\\notepad.exe',
    }),
    makeProcessEntry({ pid: 4, name: 'orphan.exe', cpuPercent: 1, workingSetBytes: 10 }),
  ];

  it('groups processes by executable path', () => {
    const groups = groupProcesses(grouped);
    expect(groups).toHaveLength(3);
    const chrome = groups.find((g) => g.key === 'C:\\chrome.exe');
    expect(chrome?.processes.map((p) => p.pid)).toEqual([1, 2]);
  });

  it('falls back to the process name when execPath is unavailable', () => {
    const groups = groupProcesses(grouped);
    expect(groups.some((g) => g.key === 'orphan.exe')).toBe(true);
    expect(groups.find((g) => g.key === 'orphan.exe')?.processes).toHaveLength(1);
  });

  it('aggregates cpuPercent and workingSetBytes over the group members', () => {
    const chrome = groupProcesses(grouped).find((g) => g.key === 'C:\\chrome.exe');
    expect(chrome?.cpuPercent).toBe(30);
    expect(chrome?.workingSetBytes).toBe(400);
  });

  it('marks a group protected when any member is protected', () => {
    const withProtected = groupProcesses([
      ...grouped,
      makeProcessEntry({
        pid: 5,
        name: 'chrome.exe',
        cpuPercent: 0,
        workingSetBytes: 1,
        execPath: 'C:\\chrome.exe',
        protected: true,
      }),
    ]);
    const chrome = withProtected.find((g) => g.key === 'C:\\chrome.exe');
    expect(chrome?.protected).toBe(true);
  });

  it('keeps single-process groups shallow', () => {
    const groups = groupProcesses(grouped);
    const notepad = groups.find((g) => g.key === 'C:\\notepad.exe');
    expect(notepad?.processes).toHaveLength(1);
    expect(notepad?.cpuPercent).toBe(5);
  });

  it('exposes the first member pid as the group pid', () => {
    const groups = groupProcesses(grouped);
    const chrome = groups.find((g) => g.key === 'C:\\chrome.exe');
    expect(chrome?.pid).toBe(1);
  });

  it('aggregates cpuPercent to null when every member reports null', () => {
    const allUnavailable = [
      makeProcessEntry({ pid: 1, name: 'a.exe', cpuPercent: null, execPath: 'C:\\a.exe' }),
      makeProcessEntry({ pid: 2, name: 'a.exe', cpuPercent: null, execPath: 'C:\\a.exe' }),
    ];
    const groups = groupProcesses(allUnavailable);
    expect(groups[0].cpuPercent).toBeNull();
  });

  it('sums only known members when some report null CPU', () => {
    const mixed = [
      makeProcessEntry({ pid: 1, name: 'a.exe', cpuPercent: null, execPath: 'C:\\a.exe' }),
      makeProcessEntry({ pid: 2, name: 'a.exe', cpuPercent: 12.3, execPath: 'C:\\a.exe' }),
    ];
    const groups = groupProcesses(mixed);
    expect(groups[0].cpuPercent).toBe(12.3);
  });
});

describe('sortGroups', () => {
  const grouped = [
    makeProcessEntry({ pid: 2, name: 'chrome.exe', cpuPercent: 20, execPath: 'C:\\chrome.exe' }),
    makeProcessEntry({ pid: 1, name: 'chrome.exe', cpuPercent: 10, execPath: 'C:\\chrome.exe' }),
    makeProcessEntry({ pid: 3, name: 'notepad.exe', cpuPercent: 5 }),
    makeProcessEntry({ pid: 4, name: 'orphan.exe', cpuPercent: 1 }),
  ];
  const groups = groupProcesses(grouped);

  it('sorts by aggregate cpuPercent desc', () => {
    // chrome 30, notepad 5, orphan 1
    expect(sortGroups(groups, 'cpuPercent', 'desc').map((g) => g.key)).toEqual([
      'C:\\chrome.exe',
      'notepad.exe',
      'orphan.exe',
    ]);
  });

  it('sorts by name ascending', () => {
    expect(sortGroups(groups, 'name', 'asc').map((g) => g.key)).toEqual([
      'C:\\chrome.exe',
      'notepad.exe',
      'orphan.exe',
    ]);
  });

  it('sorts by first member pid when key is pid', () => {
    expect(sortGroups(groups, 'pid', 'asc').map((g) => g.key)).toEqual([
      'C:\\chrome.exe',
      'notepad.exe',
      'orphan.exe',
    ]);
  });
});
