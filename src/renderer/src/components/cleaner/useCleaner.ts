import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CleanupCategory,
  CleanupPreviewCandidate,
  CleanupProgressEvent,
  CleanupReport,
  CleanerPreviewResponse,
} from '@shared/ipc/contracts';
import { CLEANER_CATEGORIES, INVOKE_REJECTED_MESSAGE, ipcErrorMessage } from './cleanerText';

type RunningProgress = Extract<CleanupProgressEvent, { status: 'running' }>;

/** Причина устаревания preview: истёк TTL сессии или изменился набор категорий. */
export type CleanerStaleReason = 'expired' | 'categories';

export type CleanerState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | {
      status: 'ready';
      preview: CleanerPreviewResponse;
      /** Выбор живёт внутри preview: любая смена сессии сбрасывает его структурно. */
      selectedIds: ReadonlySet<string>;
      stale: boolean;
      staleReason: CleanerStaleReason | null;
    }
  | {
      status: 'cleaning';
      sessionId: string;
      /** null до ответа invoke; первое событие своей сессии запирает ID операции. */
      operationId: string | null;
      progress: RunningProgress | null;
      selectedCount: number;
      selectedEstimatedBytes: number;
      cancelRequested: boolean;
      lastEventAt: number;
    }
  | { status: 'completed'; report: CleanupReport; estimatedBytes: number }
  | { status: 'cancelled'; report: CleanupReport; estimatedBytes: number }
  | {
      status: 'failed';
      stage: 'preview' | 'delete';
      message: string;
      report: CleanupReport | null;
      estimatedBytes: number | null;
    };

export type CleanerHook = {
  categories: CleanupCategory[];
  state: CleanerState;
  /** Истинно, когда push-прогресс молчит дольше порога (Stale). */
  progressStale: boolean;
  selectedCandidates: CleanupPreviewCandidate[];
  selectedEstimatedBytes: number;
  toggleCategory: (category: CleanupCategory) => void;
  runPreview: () => void;
  toggleCandidate: (id: string) => void;
  toggleSelectAll: () => void;
  startDelete: () => void;
  requestCancel: () => void;
};

/** Порог Stale для прогресса: события идут каждые ~100 мс, пауза дольше — поток прерван. */
const STALE_PROGRESS_MS = 10_000;
const TICK_MS = 1_000;

function matchesOperation(
  state: Extract<CleanerState, { status: 'cleaning' }>,
  event: CleanupProgressEvent
): boolean {
  if (state.operationId !== null) return event.operationId === state.operationId;
  return event.sessionId === state.sessionId;
}

/** Поздние и чужие события не перезаписывают ни прогресс, ни отчёт, ни preview (REQ-011). */
function applyProgress(state: CleanerState, event: CleanupProgressEvent): CleanerState {
  if (state.status !== 'cleaning' || !matchesOperation(state, event)) return state;
  if (event.status === 'running') {
    return { ...state, operationId: event.operationId, progress: event, lastEventAt: Date.now() };
  }
  const estimatedBytes = state.selectedEstimatedBytes;
  if (event.status === 'completed') {
    return { status: 'completed', report: event.report, estimatedBytes };
  }
  if (event.status === 'cancelled') {
    return { status: 'cancelled', report: event.report, estimatedBytes };
  }
  return {
    status: 'failed',
    stage: 'delete',
    message: 'Очистка завершилась с ошибками — подробности в отчёте.',
    report: event.report,
    estimatedBytes,
  };
}

function expirePreview(state: CleanerState, now: number): CleanerState {
  if (state.status !== 'ready' || state.stale || state.preview.expiresAt > now) return state;
  return { ...state, stale: true, staleReason: 'expired', selectedIds: new Set<string>() };
}

/**
 * Жизненный цикл Cleaner (ADR 0017): предпросмотр по категориям, явный выбор,
 * удаление только по ID действующей сессии, push-прогресс и терминальный отчёт.
 */
export function useCleaner(): CleanerHook {
  const [categories, setCategories] = useState<CleanupCategory[]>([...CLEANER_CATEGORIES]);
  const [state, setState] = useState<CleanerState>({ status: 'idle' });
  const [now, setNow] = useState(() => Date.now());
  const disposedRef = useRef(false);
  const previewSeqRef = useRef(0);

  useEffect(() => {
    disposedRef.current = false;
    const unsubscribe = window.api.cleaner.onProgress((event) => {
      if (disposedRef.current) return;
      setState((prev) => applyProgress(prev, event));
    });
    return () => {
      disposedRef.current = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state.status !== 'ready' && state.status !== 'cleaning') return;
    const timer = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      setState((prev) => expirePreview(prev, tick));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [state.status]);

  const selectedCandidates = useMemo(
    () =>
      state.status === 'ready'
        ? state.preview.candidates.filter((candidate) => state.selectedIds.has(candidate.id))
        : [],
    [state]
  );

  const selectedEstimatedBytes = useMemo(
    () => selectedCandidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
    [selectedCandidates]
  );

  const toggleCategory = useCallback((category: CleanupCategory) => {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category]
    );
    setState((prev) =>
      prev.status === 'ready' && !prev.stale
        ? { ...prev, stale: true, staleReason: 'categories', selectedIds: new Set<string>() }
        : prev
    );
  }, []);

  const runPreview = useCallback(() => {
    const seq = ++previewSeqRef.current;
    setState({ status: 'scanning' });
    void window.api.cleaner
      .preview({ categories })
      .then((result) => {
        if (disposedRef.current || seq !== previewSeqRef.current) return;
        if (result.ok) {
          setNow(Date.now());
          setState({
            status: 'ready',
            preview: result.data,
            selectedIds: new Set<string>(),
            stale: false,
            staleReason: null,
          });
        } else {
          setState({
            status: 'failed',
            stage: 'preview',
            message: ipcErrorMessage(result.error),
            report: null,
            estimatedBytes: null,
          });
        }
      })
      .catch(() => {
        // Отказ моста (reject вместо IpcResult): выходим из «Сканирование…», иначе кнопка зависнет.
        if (disposedRef.current || seq !== previewSeqRef.current) return;
        setState({
          status: 'failed',
          stage: 'preview',
          message: INVOKE_REJECTED_MESSAGE,
          report: null,
          estimatedBytes: null,
        });
      });
  }, [categories]);

  const toggleCandidate = useCallback((id: string) => {
    setState((prev) => {
      if (prev.status !== 'ready' || prev.stale) return prev;
      const next = new Set(prev.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, selectedIds: next };
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'ready' || prev.stale) return prev;
      const allSelected =
        prev.preview.candidates.length > 0 &&
        prev.preview.candidates.every((candidate) => prev.selectedIds.has(candidate.id));
      return {
        ...prev,
        selectedIds: allSelected
          ? new Set<string>()
          : new Set(prev.preview.candidates.map((candidate) => candidate.id)),
      };
    });
  }, []);

  const startDelete = useCallback(() => {
    if (state.status !== 'ready' || state.stale) return;
    if (Date.now() >= state.preview.expiresAt) {
      setState({ ...state, stale: true, staleReason: 'expired', selectedIds: new Set<string>() });
      return;
    }
    const byId = new Map(state.preview.candidates.map((candidate) => [candidate.id, candidate]));
    const candidateIds = [...state.selectedIds].filter((id) => byId.has(id));
    if (candidateIds.length === 0) return;
    const sessionId = state.preview.sessionId;
    const estimatedBytes = candidateIds.reduce(
      (sum, id) => sum + (byId.get(id)?.sizeBytes ?? 0),
      0
    );
    setState({
      status: 'cleaning',
      sessionId,
      operationId: null,
      progress: null,
      selectedCount: candidateIds.length,
      selectedEstimatedBytes: estimatedBytes,
      cancelRequested: false,
      lastEventAt: Date.now(),
    });
    void window.api.cleaner
      .delete({ sessionId, candidateIds })
      .then((result) => {
        if (disposedRef.current) return;
        if (result.ok) {
          setState((prev) =>
            prev.status === 'cleaning' && prev.sessionId === sessionId && prev.operationId === null
              ? { ...prev, operationId: result.data.operationId }
              : prev
          );
          return;
        }
        setState((prev) =>
          prev.status === 'cleaning' && prev.sessionId === sessionId
            ? {
                status: 'failed',
                stage: 'delete',
                message: ipcErrorMessage(result.error),
                report: null,
                estimatedBytes,
              }
            : prev
        );
      })
      .catch(() => {
        // Reject моста: иначе страница останется в «cleaning» с неактивной отменой.
        if (disposedRef.current) return;
        setState((prev) =>
          prev.status === 'cleaning' && prev.sessionId === sessionId
            ? {
                status: 'failed',
                stage: 'delete',
                message: INVOKE_REJECTED_MESSAGE,
                report: null,
                estimatedBytes,
              }
            : prev
        );
      });
  }, [state]);

  const requestCancel = useCallback(() => {
    if (state.status !== 'cleaning' || state.operationId === null || state.cancelRequested) return;
    const operationId = state.operationId;
    setState((prev) => (prev.status === 'cleaning' ? { ...prev, cancelRequested: true } : prev));
    void window.api.cleaner
      .cancel({ operationId })
      .then((result) => {
        if (disposedRef.current || result.ok) return;
        setState((prev) =>
          prev.status === 'cleaning' && prev.operationId === operationId
            ? { ...prev, cancelRequested: false }
            : prev
        );
      })
      .catch(() => {
        // Reject моста: снимаем «Отмена запрошена…», чтобы кнопка отмены не зависла.
        if (disposedRef.current) return;
        setState((prev) =>
          prev.status === 'cleaning' && prev.operationId === operationId
            ? { ...prev, cancelRequested: false }
            : prev
        );
      });
  }, [state]);

  return {
    categories,
    state,
    progressStale: state.status === 'cleaning' && now - state.lastEventAt > STALE_PROGRESS_MS,
    selectedCandidates,
    selectedEstimatedBytes,
    toggleCategory,
    runPreview,
    toggleCandidate,
    toggleSelectAll,
    startDelete,
    requestCancel,
  };
}
