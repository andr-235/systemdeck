import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { LiveSnapshot, ProcessSnapshot } from '@shared/ipc';

const STALE_MULTIPLIER = 3;
// Единственная точка дефолтного каденса (дефолт подписки, ADR 0008).
const DEFAULT_POLL_INTERVAL_MS = 1000;
// Окно истории sparkline: 90 точек при 1 с каденсе (90 с, лимит 60-300 с).
export const HISTORY_POINTS = 90;

// Накопление ряда для sparkline в обработчике IPC-пуша (вне эффектов):
// аппендится каждый тик, даже если значение не изменилось (плоская линия).
function appendHistory(
  setter: Dispatch<SetStateAction<number[]>>,
  value: number | null | undefined
): void {
  if (value === null || value === undefined || !Number.isFinite(value)) return;
  setter((history) => [...history, value].slice(-HISTORY_POINTS));
}

export type LiveState = {
  snapshot: LiveSnapshot | null;
  processSnapshot: ProcessSnapshot | null;
  cpuHistory: number[];
  memoryHistory: number[];
  stale: boolean;
  subscribed: boolean;
  error: string | null;
  paused: boolean;
  togglePause: () => void;
};

export function useLiveMetrics(): LiveState {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [processSnapshot, setProcessSnapshot] = useState<ProcessSnapshot | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const intervalMs = DEFAULT_POLL_INTERVAL_MS;

  const clearStaleTimer = (): void => {
    if (staleTimerRef.current !== null) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }
  };

  // Пауза замораживает отображение: снимки игнорируются, stale-таймер не запускается.
  const togglePause = (): void => {
    setPaused((prev) => {
      const next = !prev;
      pausedRef.current = next;
      clearStaleTimer();
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;

    const unsubscribeLive = window.api.onLiveSnapshot((next) => {
      if (cancelled || pausedRef.current) return;
      setSnapshot(next);
      appendHistory(setCpuHistory, next.cpu?.overall);
      appendHistory(setMemoryHistory, next.memory?.percent);
      setStale(false);
      clearStaleTimer();
      staleTimerRef.current = setTimeout(() => {
        if (!cancelled && !pausedRef.current) setStale(true);
      }, intervalMs * STALE_MULTIPLIER);
    });

    const unsubscribeProcess = window.api.onProcessSnapshot((next) => {
      if (cancelled || pausedRef.current) return;
      setProcessSnapshot(next);
    });

    void (async () => {
      const result = await window.api.live.subscribe({ intervalMs });
      if (cancelled) return;
      if (result.ok) {
        setSubscribed(true);
      } else {
        setError(result.error.message);
      }
    })();

    return () => {
      cancelled = true;
      clearStaleTimer();
      unsubscribeLive();
      unsubscribeProcess();
      void window.api.live.unsubscribe();
    };
  }, [intervalMs]);

  return {
    snapshot,
    processSnapshot,
    cpuHistory,
    memoryHistory,
    stale,
    subscribed,
    error,
    paused,
    togglePause,
  };
}
