import { describe, expect, it } from 'vitest';
import type { CleanupItemResult } from '@shared/ipc/contracts';
import { buildCleanupReport } from './report';

describe('cleanup report', () => {
  it('keeps partial failures and converges the summary with per-item entries', () => {
    const items: CleanupItemResult[] = [
      { path: 'a.tmp', success: true, bytesFreed: 100 },
      { path: 'b.tmp', success: true, bytesFreed: 50 },
      {
        path: 'c.tmp',
        success: false,
        bytesFreed: 0,
        error: { code: 'CLEAN_DELETE_FAILED', message: 'locked' },
      },
    ];
    const report = buildCleanupReport(items);
    expect(report.total).toBe(3);
    expect(report.succeeded).toBe(2);
    expect(report.failed).toBe(1);
    expect(report.freedBytes).toBe(150);
    expect(report.items).toHaveLength(3);
    expect(report.items[2].success).toBe(false);
  });

  it('reports zeros for an empty run', () => {
    expect(buildCleanupReport([])).toEqual({
      items: [],
      total: 0,
      succeeded: 0,
      failed: 0,
      freedBytes: 0,
    });
  });
});
