import type { CleanupItemResult, CleanupReport } from '@shared/ipc/contracts';

/** Per-item отчёт: частичные неуспехи сохраняются, сводка сходится с суммой. */
export function buildCleanupReport(items: CleanupItemResult[]): CleanupReport {
  let succeeded = 0;
  let failed = 0;
  let freedBytes = 0;
  for (const item of items) {
    if (item.success) {
      succeeded++;
      freedBytes += item.bytesFreed;
    } else {
      failed++;
    }
  }
  return { items: [...items], total: items.length, succeeded, failed, freedBytes };
}
