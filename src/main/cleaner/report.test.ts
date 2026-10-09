import { describe, expect, it } from 'vitest';
import type { CleanupItemResult } from '@shared/ipc/contracts';
import { buildCleanupReport } from './report';

describe('cleanup report', () => {
  it('keeps partial failures and skips and converges the summary with per-item entries', () => {
    const items: CleanupItemResult[] = [
      { path: 'a.tmp', outcome: 'deleted', bytesFreed: 100 },
      { path: 'b.tmp', outcome: 'deleted', bytesFreed: 50 },
      { path: 'c.tmp', outcome: 'skipped', bytesFreed: 0, code: 'CLEAN_ENTRY_INVALID' },
      {
        path: 'd.tmp',
        outcome: 'failed',
        bytesFreed: 0,
        error: { code: 'CLEAN_DELETE_FAILED', message: 'locked' },
      },
    ];
    const report = buildCleanupReport(items);
    expect(report.total).toBe(4);
    expect(report.deleted).toBe(2);
    expect(report.skipped).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.freedBytes).toBe(150);
    expect(report.items).toHaveLength(4);
    expect(report.items[3].outcome).toBe('failed');
  });

  it('never reports a failure as a full success', () => {
    const report = buildCleanupReport([
      { path: 'a.tmp', outcome: 'failed', bytesFreed: 0, error: { code: 'X', message: 'y' } },
    ]);
    expect(report.deleted).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.freedBytes).toBe(0);
  });

  it('reports zeros for an empty run', () => {
    expect(buildCleanupReport([])).toEqual({
      items: [],
      total: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
      freedBytes: 0,
    });
  });
});
