import type { ProcessEntry } from './ipc';

/**
 * Детерминированная сортировка записей процесса: CPU% по убыванию, затем pid по
 * возрастанию (ADR 0009). `cpuPercent: null` (Unavailable — нет предыдущего
 * сэмпла) уходит в конец. Общий компаратор для Main-монитора и Renderer.
 */
export function compareProcessEntryByCpuPid(a: ProcessEntry, b: ProcessEntry): number {
  return (b.cpuPercent ?? -1) - (a.cpuPercent ?? -1) || a.pid - b.pid;
}
