import { useCallback, useEffect, useState } from 'react';
import type { ScanProgressEvent, ScanResult } from '@shared/ipc';

export type ScanningProgress = Extract<ScanProgressEvent, { status: 'scanning' }>;

export type StorageScanState =
  | { status: 'idle'; volumeId: string }
  | { status: 'scanning'; volumeId: string; progress: ScanningProgress | null }
  | {
      status: 'complete';
      volumeId: string;
      result: ScanResult;
      progress: ScanningProgress | null;
    }
  | { status: 'cancelled'; volumeId: string }
  | { status: 'failed'; volumeId: string; message: string };

/**
 * Жизненный цикл сканирования одного тома (ADR 0013): подписка на push-события,
 * чтение закешированного результата, действия start/cancel. Пуш-события — источник
 * истины; getScanResult заполняет состояние сразу после монтирования.
 */
export function useStorageScan(volumeId: string): {
  state: StorageScanState;
  startScan: () => void;
  cancelScan: () => void;
} {
  const [state, setState] = useState<StorageScanState>({ status: 'idle', volumeId });

  useEffect(() => {
    let disposed = false;

    const unsubscribe = window.api.storage.onScanProgress((event) => {
      if (disposed || event.volumeId !== volumeId) return;
      setState((prev) => {
        switch (event.status) {
          case 'scanning':
            if (prev.status === 'scanning') {
              return { ...prev, progress: event };
            }
            return { status: 'scanning', volumeId, progress: event };
          case 'complete':
            return { status: 'complete', volumeId, result: event.result, progress: null };
          case 'cancelled':
            return { status: 'cancelled', volumeId };
          case 'failed':
            return { status: 'failed', volumeId, message: event.message };
        }
      });
    });

    void (async () => {
      const result = await window.api.storage.getScanResult(volumeId);
      if (disposed) return;
      if (result.ok) {
        if (result.data) {
          setState({ status: 'complete', volumeId, result: result.data, progress: null });
        } else {
          setState((prev) =>
            prev.status === 'scanning' || prev.status === 'complete'
              ? prev
              : { status: 'idle', volumeId }
          );
        }
      } else {
        setState({ status: 'failed', volumeId, message: result.error.message });
      }
    })();

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [volumeId]);

  const startScan = useCallback(() => {
    setState((prev) =>
      prev.status === 'scanning'
        ? prev
        : {
            status: 'scanning',
            volumeId,
            progress: prev.status === 'complete' ? prev.progress : null,
          }
    );
    void window.api.storage.startScan({ volumeId }).then((result) => {
      if (!result.ok) {
        setState((prev) =>
          prev.status === 'scanning'
            ? { status: 'failed', volumeId, message: result.error.message }
            : prev
        );
      }
    });
  }, [volumeId]);

  const cancelScan = useCallback(() => {
    setState({ status: 'cancelled', volumeId });
    void window.api.storage.cancelScan();
  }, [volumeId]);

  return { state, startScan, cancelScan };
}