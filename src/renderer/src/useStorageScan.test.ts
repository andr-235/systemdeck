import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStorageScan } from './useStorageScan';
import { setMockApi } from './test-utils';
import type { AppAPI } from '@shared/api';
import type { ScanProgressEvent, ScanResult } from '@shared/ipc';

function makeResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    volumeId: 'C:',
    timestamp: 0,
    durationMs: 10,
    totalBytes: 100,
    fileCount: 5,
    inaccessibleDirectories: 0,
    tree: {
      name: 'C:',
      path: 'C:',
      sizeBytes: 100,
      filesBytes: 100,
      fileCount: 5,
      inaccessible: false,
      children: [],
    },
    largestFiles: [],
    typeTotals: [],
    ...overrides,
  };
}

type Capture = { push: (event: ScanProgressEvent) => void };

function captureApi(
  getScanResult?: AppAPI['storage']['getScanResult']
): Capture {
  const capture: Capture = { push: () => undefined };
  const onScanProgress = vi.fn((cb: (event: ScanProgressEvent) => void) => {
    capture.push = cb;
    return () => undefined;
  });
  setMockApi({
    onScanProgress,
    getScanResult: getScanResult ?? (async () => ({ ok: true as const, data: null })),
    startScan: vi.fn(async () => ({ ok: true as const, data: undefined })),
    cancelScan: vi.fn(async () => ({ ok: true as const, data: undefined })),
  });
  return capture;
}

describe('Renderer — useStorageScan (jsdom project)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts idle when no cached result exists', async () => {
    captureApi();
    const { result } = renderHook(() => useStorageScan('C:'));
    await waitFor(() => expect(result.current.state.status).toBe('idle'));
  });

  it('loads a cached result into complete state on mount', async () => {
    captureApi(async () => ({ ok: true as const, data: makeResult({ totalBytes: 777 }) }));
    const { result } = renderHook(() => useStorageScan('C:'));
    await waitFor(() => expect(result.current.state.status).toBe('complete'));
    expect(result.current.state).toMatchObject({ status: 'complete', result: { totalBytes: 777 } });
  });

  it('startScan flips to scanning and calls the api once', async () => {
    captureApi();
    const { result } = renderHook(() => useStorageScan('C:'));
    await waitFor(() => expect(result.current.state.status).toBe('idle'));

    await act(async () => {
      result.current.startScan();
    });

    expect(result.current.state.status).toBe('scanning');
    expect(window.api.storage.startScan).toHaveBeenCalledWith({ volumeId: 'C:' });
  });

  it('complete push yields a complete state with the result', async () => {
    const capture = captureApi();
    const { result } = renderHook(() => useStorageScan('C:'));
    await waitFor(() => expect(result.current.state.status).toBe('idle'));

    await act(async () => {
      capture.push({
        status: 'complete',
        volumeId: 'C:',
        result: makeResult({ totalBytes: 500 }),
      });
    });

    expect(result.current.state).toMatchObject({ status: 'complete', result: { totalBytes: 500 } });
  });

  it('keeps a progress field during scanning and after complete push', async () => {
    const capture = captureApi();
    const { result } = renderHook(() => useStorageScan('C:'));

    await act(async () => {
      result.current.startScan();
    });
    await act(async () => {
      capture.push({
        status: 'scanning',
        volumeId: 'C:',
        scannedEntries: 3,
        scannedBytes: 100,
        inaccessibleDirectories: 0,
        currentPath: 'C:\\Windows',
      });
    });
    expect(result.current.state.status).toBe('scanning');
    if (result.current.state.status === 'scanning') {
      expect(result.current.state.progress?.scannedEntries).toBe(3);
    }

    await act(async () => {
      capture.push({ status: 'complete', volumeId: 'C:', result: makeResult() });
    });
    expect(result.current.state.status).toBe('complete');
  });

  it('cancelScan reports cancelled immediately and calls the api', async () => {
    captureApi();
    const { result } = renderHook(() => useStorageScan('C:'));
    await waitFor(() => expect(result.current.state.status).toBe('idle'));

    await act(async () => {
      result.current.cancelScan();
    });

    expect(result.current.state.status).toBe('cancelled');
    expect(window.api.storage.cancelScan).toHaveBeenCalledTimes(1);
  });

  it('failed push after a scan started surfaces the failure message', async () => {
    const capture = captureApi();
    const { result } = renderHook(() => useStorageScan('C:'));

    await act(async () => {
      result.current.startScan();
    });
    await act(async () => {
      capture.push({ status: 'failed', volumeId: 'C:', message: 'boom' });
    });

    expect(result.current.state).toMatchObject({ status: 'failed', message: 'boom' });
  });

  it('ignores pushes for other volumes', async () => {
    const capture = captureApi();
    const { result } = renderHook(() => useStorageScan('C:'));

    await act(async () => {
      capture.push({ status: 'complete', volumeId: 'D:', result: makeResult() });
    });
    expect(result.current.state.status).toBe('idle');

    await act(async () => {
      result.current.startScan();
    });
    await act(async () => {
      capture.push({ status: 'complete', volumeId: 'D:', result: makeResult() });
    });
    expect(result.current.state.status).toBe('scanning');
  });

  it('refetches cache when the volume changes', async () => {
    const getScanResult = vi.fn(async (volumeId: string) => ({
      ok: true as const,
      data: makeResult({ volumeId }),
    }));
    captureApi(getScanResult);
    const { result, rerender } = renderHook(({ volume }) => useStorageScan(volume), {
      initialProps: { volume: 'C:' },
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'complete' }));

    rerender({ volume: 'D:' });
    await waitFor(() =>
      expect(getScanResult).toHaveBeenLastCalledWith('D:')
    );
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'complete' }));
  });

  it('does not auto-start a scan on mount and serves cache without rescan', async () => {
    const startScan = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const getScanResult = vi.fn(async () => ({ ok: true as const, data: makeResult() }));
    const capture = captureApi(getScanResult);
    // подменяем startScan после captureApi, чтобы отследить авто-вызовы
    (window.api.storage.startScan as unknown as typeof startScan) = startScan;
    void capture;
    const { result } = renderHook(() => useStorageScan('C:'));
    await waitFor(() => expect(result.current.state.status).toBe('complete'));
    expect(startScan).not.toHaveBeenCalled();
    expect(getScanResult).toHaveBeenCalledWith('C:');
  });

  it('transitions idle to scanning on a scanning push (scan started elsewhere)', async () => {
    const capture = captureApi();
    const { result } = renderHook(() => useStorageScan('C:'));
    await waitFor(() => expect(result.current.state.status).toBe('idle'));

    await act(async () => {
      capture.push({
        status: 'scanning',
        volumeId: 'C:',
        scannedEntries: 1,
        scannedBytes: 10,
        inaccessibleDirectories: 0,
        currentPath: 'C:\\',
      });
    });

    expect(result.current.state.status).toBe('scanning');
    if (result.current.state.status === 'scanning') {
      expect(result.current.state.progress?.scannedEntries).toBe(1);
    }
  });

  it('returns to scanning when a new scan starts after complete', async () => {
    const capture = captureApi(async () => ({ ok: true as const, data: makeResult() }));
    const { result } = renderHook(() => useStorageScan('C:'));
    await waitFor(() => expect(result.current.state.status).toBe('complete'));

    await act(async () => {
      capture.push({
        status: 'scanning',
        volumeId: 'C:',
        scannedEntries: 2,
        scannedBytes: 20,
        inaccessibleDirectories: 0,
        currentPath: 'C:\\a',
      });
    });

    expect(result.current.state.status).toBe('scanning');
  });
});