import type { ScanProgressEvent, ScanResult } from '@shared/ipc';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { getLogger } from '../logger';
import { nodeScanFs, runScan, ScanCancelledError, type ScanFs } from './scan';

const logger = getLogger('storage');

export type ScanManagerDeps = {
  fs?: ScanFs;
  /** Троттлинг прогресса сканирования (~100 мс, ADR 0013). */
  throttleMs?: number;
  /** Отправка push-событий прогресса в Renderer. */
  send: (event: ScanProgressEvent) => void;
};

export class ScanManager {
  static readonly DEFAULT_THROTTLE_MS = 100;

  private readonly fs: ScanFs;
  private readonly throttleMs: number;
  private readonly send: (event: ScanProgressEvent) => void;
  private readonly cache = new Map<string, ScanResult>();
  private activeScan: { volumeId: string; cancelled: boolean } | null = null;
  private lastProgressAt = 0;

  constructor(deps: ScanManagerDeps) {
    this.fs = deps.fs ?? nodeScanFs;
    this.throttleMs = deps.throttleMs ?? ScanManager.DEFAULT_THROTTLE_MS;
    this.send = deps.send;
  }

  isActive(): boolean {
    return this.activeScan !== null;
  }

  /** Результат сканирования тома в текущей сессии; null, если сканирование не завершалось. */
  getScanResult(volumeId: string): ScanResult | null {
    return this.cache.get(volumeId) ?? null;
  }

  async startScan(volumeId: string): Promise<void> {
    if (this.activeScan) {
      throw Object.assign(new Error('Сканирование другого тома уже выполняется'), {
        code: IPC_ERROR_CODES.SCAN_ALREADY_ACTIVE,
      });
    }
    const active = { volumeId, cancelled: false };
    this.activeScan = active;
    this.lastProgressAt = 0;
    try {
      const result = await runScan(volumeId, this.fs, {
        isCancelled: () => active.cancelled,
        onProgress: (progress) => this.emitScanning(active.volumeId, progress),
      });
      this.cache.set(volumeId, result);
      this.activeScan = null;
      this.send({ status: 'complete', volumeId, result });
    } catch (error) {
      this.activeScan = null;
      if (error instanceof ScanCancelledError) {
        this.send({ status: 'cancelled', volumeId });
      } else {
        logger.error('storage scan failed', { volumeId, error });
        this.send({ status: 'failed', volumeId, message: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }
  }

  cancelScan(): void {
    const active = this.activeScan;
    if (!active) {
      throw Object.assign(new Error('Нет активного сканирования'), {
        code: IPC_ERROR_CODES.SCAN_NOT_ACTIVE,
      });
    }
    active.cancelled = true;
  }

  private emitScanning(volumeId: string, progress: { scannedEntries: number; scannedBytes: number; inaccessibleDirectories: number; currentPath: string }): void {
    const now = performance.now();
    if (now - this.lastProgressAt < this.throttleMs) {
      return;
    }
    this.lastProgressAt = now;
    this.send({
      status: 'scanning',
      volumeId,
      scannedEntries: progress.scannedEntries,
      scannedBytes: progress.scannedBytes,
      inaccessibleDirectories: progress.inaccessibleDirectories,
      currentPath: progress.currentPath,
    });
  }
}