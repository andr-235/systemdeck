import type { CleanupItemResult, CleanupReport } from '@shared/ipc/contracts';

/** Per-item отчёт: частичные неуспехи и пропуски сохраняются, сводка сходится с суммой. */
export function buildCleanupReport(items: CleanupItemResult[]): CleanupReport {
  let deleted = 0;
  let skipped = 0;
  let failed = 0;
  let freedBytes = 0;
  for (const item of items) {
    switch (item.outcome) {
      case 'deleted':
        deleted++;
        freedBytes += item.bytesFreed;
        break;
      case 'skipped':
        skipped++;
        break;
      case 'failed':
        failed++;
        break;
    }
  }
  return { items: [...items], total: items.length, deleted, skipped, failed, freedBytes };
}
