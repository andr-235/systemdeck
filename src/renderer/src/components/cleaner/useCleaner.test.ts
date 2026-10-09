import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCleaner } from './useCleaner';
import { CLEANER_CATEGORIES } from './cleanerText';
import {
  makeCleanupPreview,
  makeCleanupReport,
  makePreviewCandidate,
  makeRunningProgress,
  makeTerminalProgress,
  setMockApi,
} from '../../test-utils';
import type { AppAPI } from '@shared/api';
import type { CleanerPreviewResponse, CleanupProgressEvent } from '@shared/ipc';
import type { IpcResult } from '@shared/ipc/errors';

type PreviewMock = AppAPI['cleaner']['preview'];
type DeleteMock = AppAPI['cleaner']['delete'];

type Capture = {
  push: (event: CleanupProgressEvent) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
  setPreview: (implementation: PreviewMock) => void;
  setDelete: (implementation: DeleteMock) => void;
};

function captureCleaner(overrides: { preview?: PreviewMock; delete?: DeleteMock } = {}): Capture {
  let previewImpl: PreviewMock =
    overrides.preview ?? (async () => ({ ok: true as const, data: makeCleanupPreview() }));
  let deleteImpl: DeleteMock =
    overrides.delete ?? (async () => ({ ok: true as const, data: { operationId: 'op-1' } }));
  const capture: Capture = {
    push: () => undefined,
    unsubscribe: vi.fn(),
    setPreview: (implementation) => {
      previewImpl = implementation;
    },
    setDelete: (implementation) => {
      deleteImpl = implementation;
    },
  };
  setMockApi({
    cleanerOnProgress: vi.fn((callback: (event: CleanupProgressEvent) => void) => {
      capture.push = callback;
      return capture.unsubscribe;
    }),
    cleanerPreview: vi.fn((request) => previewImpl(request)),
    cleanerDelete: vi.fn((request) => deleteImpl(request)),
    cleanerCancel: vi.fn(async () => ({ ok: true as const, data: undefined })),
  });
  return capture;
}

function previewWith(
  candidates: ReturnType<typeof makePreviewCandidate>[],
  sessionId = 'session-1'
): PreviewMock {
  return async () => ({
    ok: true as const,
    data: makeCleanupPreview({
      sessionId,
      candidates,
      estimatedBytes: candidates.reduce((sum, item) => sum + item.sizeBytes, 0),
    }),
  });
}

async function previewAndReady(result: { current: ReturnType<typeof useCleaner> }): Promise<void> {
  await act(async () => {
    result.current.runPreview();
  });
  await waitFor(() => expect(result.current.state.status).toBe('ready'));
}

describe('cleaner — useCleaner (jsdom project)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle and releases the progress subscription on unmount', () => {
    const capture = captureCleaner();
    const { unmount } = renderHook(() => useCleaner());
    expect(capture.unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(capture.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('serves preview with no selection by default', async () => {
    captureCleaner({ preview: previewWith([makePreviewCandidate()]) });
    const { result } = renderHook(() => useCleaner());
    expect(result.current.state.status).toBe('idle');

    await previewAndReady(result);
    expect(result.current.selectedCandidates).toEqual([]);
    expect(result.current.selectedEstimatedBytes).toBe(0);
    expect(window.api.cleaner.preview).toHaveBeenCalledWith({
      categories: [...CLEANER_CATEGORIES],
    });
  });

  it('surfaces a preview failure as a Russian user message', async () => {
    captureCleaner({
      preview: async () => ({
        ok: false as const,
        error: { code: 'CLEAN_SESSION_NOT_FOUND', message: 'internal detail' },
      }),
    });
    const { result } = renderHook(() => useCleaner());

    await act(async () => {
      result.current.runPreview();
    });
    await waitFor(() => expect(result.current.state.status).toBe('failed'));

    expect(result.current.state).toMatchObject({
      status: 'failed',
      stage: 'preview',
      message: 'Предпросмотр устарел — выполните сканирование заново.',
      report: null,
    });
  });

  it('ignores a late preview response when a newer request is already answered', async () => {
    const resolvers: Array<(value: IpcResult<CleanerPreviewResponse>) => void> = [];
    captureCleaner({
      preview: () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    });
    const { result } = renderHook(() => useCleaner());

    await act(async () => {
      result.current.runPreview();
    });
    await act(async () => {
      result.current.runPreview();
    });
    expect(resolvers).toHaveLength(2);

    await act(async () => {
      resolvers[1]?.({
        ok: true,
        data: makeCleanupPreview({
          sessionId: 'session-2',
          candidates: [makePreviewCandidate({ id: 'b1' })],
        }),
      });
    });
    await act(async () => {
      resolvers[0]?.({
        ok: true,
        data: makeCleanupPreview({
          sessionId: 'session-1',
          candidates: [makePreviewCandidate({ id: 'a1' })],
        }),
      });
    });

    expect(result.current.state).toMatchObject({
      status: 'ready',
      preview: { sessionId: 'session-2' },
    });
    expect(result.current.selectedCandidates).toEqual([]);
  });

  it('never calls delete without a selection and only sends current-session ids', async () => {
    captureCleaner({
      preview: previewWith([makePreviewCandidate({ id: 'a1' })]),
    });
    const { result } = renderHook(() => useCleaner());
    await previewAndReady(result);

    await act(async () => {
      result.current.startDelete();
    });
    expect(window.api.cleaner.delete).not.toHaveBeenCalled();

    await act(async () => {
      result.current.toggleCandidate('a1');
    });
    await act(async () => {
      result.current.startDelete();
    });
    expect(window.api.cleaner.delete).toHaveBeenCalledWith({
      sessionId: 'session-1',
      candidateIds: ['a1'],
    });
    expect(result.current.state.status).toBe('cleaning');
  });

  it('drops selection from a previous session when a new preview arrives', async () => {
    const capture = captureCleaner({
      preview: previewWith([makePreviewCandidate({ id: 'a1' })]),
    });
    const { result } = renderHook(() => useCleaner());
    await previewAndReady(result);

    await act(async () => {
      result.current.toggleCandidate('a1');
    });
    capture.setPreview(previewWith([makePreviewCandidate({ id: 'b1' })], 'session-2'));

    await act(async () => {
      result.current.runPreview();
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.selectedCandidates).toEqual([]);

    await act(async () => {
      result.current.startDelete();
    });
    expect(window.api.cleaner.delete).not.toHaveBeenCalled();

    await act(async () => {
      result.current.toggleCandidate('b1');
    });
    await act(async () => {
      result.current.startDelete();
    });
    expect(window.api.cleaner.delete).toHaveBeenCalledWith({
      sessionId: 'session-2',
      candidateIds: ['b1'],
    });
  });

  it('marks the preview stale and clears the selection when categories change', async () => {
    captureCleaner({ preview: previewWith([makePreviewCandidate({ id: 'a1' })]) });
    const { result } = renderHook(() => useCleaner());
    await previewAndReady(result);
    await act(async () => {
      result.current.toggleCandidate('a1');
    });

    await act(async () => {
      result.current.toggleCategory('recycle-bin');
    });

    expect(result.current.state).toMatchObject({
      status: 'ready',
      stale: true,
      staleReason: 'categories',
    });
    expect(result.current.selectedCandidates).toEqual([]);
    await act(async () => {
      result.current.startDelete();
    });
    expect(window.api.cleaner.delete).not.toHaveBeenCalled();
  });

  it('ignores foreign progress and applies the terminal report of its own operation', async () => {
    const capture = captureCleaner({ preview: previewWith([makePreviewCandidate()]) });
    const { result } = renderHook(() => useCleaner());
    await previewAndReady(result);
    await act(async () => {
      result.current.toggleCandidate('c1');
    });
    await act(async () => {
      result.current.startDelete();
    });
    await waitFor(() => expect(result.current.state.status).toBe('cleaning'));

    await act(async () => {
      capture.push(makeRunningProgress({ operationId: 'op-other', sessionId: 'session-other' }));
    });
    expect(result.current.state).toMatchObject({ status: 'cleaning', progress: null });

    await act(async () => {
      capture.push(makeRunningProgress({ processed: 1, total: 2, freedBytes: 512 }));
    });
    expect(result.current.state).toMatchObject({
      status: 'cleaning',
      operationId: 'op-1',
      progress: { processed: 1, freedBytes: 512 },
    });

    await act(async () => {
      capture.push(
        makeTerminalProgress('completed', {
          report: makeCleanupReport({ total: 2, deleted: 2, freedBytes: 1024 }),
        })
      );
    });
    expect(result.current.state).toMatchObject({
      status: 'completed',
      report: { total: 2, deleted: 2, freedBytes: 1024 },
      estimatedBytes: 1024,
    });
  });

  it('does not let a late push overwrite a freshly built preview', async () => {
    const capture = captureCleaner({ preview: previewWith([makePreviewCandidate()]) });
    const { result } = renderHook(() => useCleaner());
    await previewAndReady(result);
    await act(async () => {
      result.current.toggleCandidate('c1');
    });
    await act(async () => {
      result.current.startDelete();
    });
    await waitFor(() => expect(result.current.state.status).toBe('cleaning'));
    await act(async () => {
      capture.push(makeTerminalProgress('completed'));
    });
    expect(result.current.state.status).toBe('completed');

    capture.setPreview(previewWith([makePreviewCandidate({ id: 'z1' })], 'session-2'));
    await act(async () => {
      result.current.runPreview();
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      capture.push(
        makeTerminalProgress('completed', {
          report: makeCleanupReport({ total: 9, deleted: 9, freedBytes: 999 }),
        })
      );
    });
    expect(result.current.state).toMatchObject({
      status: 'ready',
      preview: { sessionId: 'session-2' },
    });
    expect(result.current.selectedCandidates).toEqual([]);
  });

  it('requests cancel once and finishes with the terminal cancelled report', async () => {
    const capture = captureCleaner({ preview: previewWith([makePreviewCandidate()]) });
    const { result } = renderHook(() => useCleaner());
    await previewAndReady(result);
    await act(async () => {
      result.current.toggleCandidate('c1');
    });
    await act(async () => {
      result.current.startDelete();
    });
    await waitFor(() => expect(result.current.state.status).toBe('cleaning'));

    await act(async () => {
      result.current.requestCancel();
    });
    await act(async () => {
      result.current.requestCancel();
    });
    expect(window.api.cleaner.cancel).toHaveBeenCalledTimes(1);
    expect(window.api.cleaner.cancel).toHaveBeenCalledWith({ operationId: 'op-1' });
    expect(result.current.state).toMatchObject({ status: 'cleaning', cancelRequested: true });

    await act(async () => {
      capture.push(
        makeTerminalProgress('cancelled', {
          report: makeCleanupReport({ total: 1, deleted: 1, freedBytes: 77 }),
        })
      );
    });
    expect(result.current.state).toMatchObject({
      status: 'cancelled',
      report: { deleted: 1, freedBytes: 77 },
      estimatedBytes: 1024,
    });
  });

  it('reports a delete invocation failure as a Russian user message', async () => {
    captureCleaner({
      preview: previewWith([makePreviewCandidate()]),
      delete: async () => ({
        ok: false as const,
        error: { code: 'CLEAN_SESSION_NOT_FOUND', message: 'gone' },
      }),
    });
    const { result } = renderHook(() => useCleaner());
    await previewAndReady(result);
    await act(async () => {
      result.current.toggleCandidate('c1');
    });
    await act(async () => {
      result.current.startDelete();
    });

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(result.current.state).toMatchObject({
      status: 'failed',
      stage: 'delete',
      message: 'Предпросмотр устарел — выполните сканирование заново.',
    });
  });

  it('expires the preview: clears the selection and blocks delete', async () => {
    vi.useFakeTimers();
    const expiresAt = Date.now() + 1500;
    captureCleaner({
      preview: async () => ({
        ok: true as const,
        data: makeCleanupPreview({ candidates: [makePreviewCandidate()], expiresAt }),
      }),
    });
    const { result } = renderHook(() => useCleaner());

    await act(async () => {
      result.current.runPreview();
    });
    expect(result.current.state.status).toBe('ready');
    await act(async () => {
      result.current.toggleCandidate('c1');
    });
    expect(result.current.selectedCandidates).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.state).toMatchObject({
      status: 'ready',
      stale: true,
      staleReason: 'expired',
    });
    expect(result.current.selectedCandidates).toEqual([]);
    await act(async () => {
      result.current.startDelete();
    });
    expect(window.api.cleaner.delete).not.toHaveBeenCalled();
  });

  it('marks the progress stale when events stop arriving', async () => {
    vi.useFakeTimers();
    captureCleaner({ preview: previewWith([makePreviewCandidate()]) });
    const { result } = renderHook(() => useCleaner());

    await act(async () => {
      result.current.runPreview();
    });
    await act(async () => {
      result.current.toggleCandidate('c1');
    });
    await act(async () => {
      result.current.startDelete();
    });
    expect(result.current.state.status).toBe('cleaning');
    expect(result.current.progressStale).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });

    expect(result.current.progressStale).toBe(true);
  });
});
