import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import StoragePage from './StoragePage';
import { setMockApi } from '../test-utils';
import type { DiskVolumeMetrics, ScanProgressEvent, ScanResult } from '@shared/ipc';

function makeDisks(): DiskVolumeMetrics[] {
  return [
    {
      id: 'C:',
      name: 'System',
      fileSystem: 'NTFS',
      total: 1000,
      used: 600,
      free: 400,
      percent: 60,
    },
    {
      id: 'D:',
      name: 'Data',
      fileSystem: 'NTFS',
      total: 2000,
      used: 100,
      free: 1900,
      percent: 5,
    },
  ];
}

function makeResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    volumeId: 'C:',
    timestamp: 0,
    durationMs: 1200,
    totalBytes: 600,
    fileCount: 10,
    inaccessibleDirectories: 1,
    tree: {
      name: 'C:',
      path: 'C:',
      sizeBytes: 600,
      filesBytes: 100,
      fileCount: 10,
      inaccessible: false,
      children: [],
    },
    largestFiles: [],
    typeTotals: [],
    ...overrides,
  };
}

type Capture = { push: (event: ScanProgressEvent) => void };

function setup(
  opts: {
    getScanResult?: (volumeId: string) => Promise<{ ok: true; data: ScanResult | null }>;
    disks?: DiskVolumeMetrics[] | null;
  } = {}
): Capture {
  const capture: Capture = { push: () => undefined };
  const onScanProgress = vi.fn((cb: (event: ScanProgressEvent) => void) => {
    capture.push = cb;
    return () => undefined;
  });
  setMockApi({
    onScanProgress,
    getScanResult: opts.getScanResult ?? (async () => ({ ok: true as const, data: null })),
    startScan: vi.fn(async () => ({ ok: true as const, data: undefined })),
    cancelScan: vi.fn(async () => ({ ok: true as const, data: undefined })),
  });
  const disks = opts.disks === undefined ? makeDisks() : opts.disks;
  render(<StoragePage disks={disks} />);
  return capture;
}

describe('Renderer — StoragePage (jsdom project)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setMockApi({});
  });

  it('показывает Unavailable-скелет, когда тома ещё загружаются', () => {
    setup({ disks: null });
    expect(screen.getByRole('heading', { name: 'Хранилище' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Загрузка томов…');
  });

  it('показывает Unavailable, когда фиксированных томов нет', () => {
    setup({ disks: [] });
    expect(screen.getByRole('status')).toHaveTextContent('Нет фиксированных томов');
  });

  it('читает кэш при входе без авто-скана', async () => {
    const getScanResult = vi.fn(async () => ({ ok: true as const, data: makeResult() }));
    const startScan = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const capture: Capture = { push: () => undefined };
    const onScanProgress = vi.fn((cb: (event: ScanProgressEvent) => void) => {
      capture.push = cb;
      return () => undefined;
    });
    setMockApi({ onScanProgress, getScanResult, startScan });
    render(<StoragePage disks={makeDisks()} />);

    await waitFor(() => expect(getScanResult).toHaveBeenCalledWith('C:'));
    expect(startScan).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Готово/)).toBeInTheDocument());
  });

  it('idle: выбор тома и кнопка Сканировать запускают скан', async () => {
    setup();
    await waitFor(() => expect(screen.getByText(/Ожидание/)).toBeInTheDocument());

    const select = screen.getByRole('combobox', { name: 'Том для сканирования' });
    expect(select).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Сканировать' }));
    });
    await waitFor(() => expect(screen.getByText(/Сканирование/)).toBeInTheDocument());
    expect(window.api.storage.startScan).toHaveBeenCalledWith({ volumeId: 'C:' });
  });

  it('смена тома перечитывает кэш нового тома', async () => {
    const getScanResult = vi.fn(async () => ({ ok: true as const, data: null }));
    const capture: Capture = { push: () => undefined };
    const onScanProgress = vi.fn((cb: (event: ScanProgressEvent) => void) => {
      capture.push = cb;
      return () => undefined;
    });
    setMockApi({
      onScanProgress,
      getScanResult,
      startScan: vi.fn(async () => ({ ok: true as const, data: undefined })),
      cancelScan: vi.fn(async () => ({ ok: true as const, data: undefined })),
    });
    render(<StoragePage disks={makeDisks()} />);
    await waitFor(() => expect(getScanResult).toHaveBeenCalledWith('C:'));

    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Том для сканирования' }), {
        target: { value: 'D:' },
      });
    });
    await waitFor(() => expect(getScanResult).toHaveBeenCalledWith('D:'));
  });

  it('scanning: прогресс-бар и отмена вызывают cancelScan', async () => {
    const capture = setup();
    await waitFor(() => expect(screen.getByText(/Ожидание/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Сканировать' }));
    });
    await act(async () => {
      capture.push({
        status: 'scanning',
        volumeId: 'C:',
        scannedEntries: 42,
        scannedBytes: 1024,
        inaccessibleDirectories: 0,
        currentPath: 'C:\\Windows',
      });
    });

    expect(screen.getByRole('progressbar', { name: 'Прогресс сканирования' })).toBeInTheDocument();
    expect(screen.getByText(/Обработано записей: 42/)).toBeInTheDocument();
    expect(screen.getByText(/Текущий путь/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    });
    expect(window.api.storage.cancelScan).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(/Отменено/)).toBeInTheDocument());
  });

  it('complete: сводка и treemap с drill-down', async () => {
    setup({
      getScanResult: async () => ({ ok: true as const, data: makeResult({ totalBytes: 777 }) }),
    });
    await waitFor(() => expect(screen.getByText(/Готово/)).toBeInTheDocument());
    expect(screen.getByText(/Всего/)).toBeInTheDocument();
    expect(screen.getByTestId('storage-treemap')).toBeInTheDocument();
    expect(screen.getByTestId('storage-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('storage-treemap-svg')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Хлебные крошки каталога' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сканировать заново' })).toBeInTheDocument();
  });

  it('failed: показывает ошибку и кнопку повторного скана', async () => {
    const capture = setup();
    await waitFor(() => expect(screen.getByText(/Ожидание/)).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Сканировать' }));
    });
    await act(async () => {
      capture.push({ status: 'failed', volumeId: 'C:', message: 'boom' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByRole('button', { name: 'Сканировать заново' })).toBeInTheDocument();
  });

  it('layout treemap + сайдбар существует в плотном окне', async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId('storage-treemap')).toBeInTheDocument());
    expect(screen.getByTestId('storage-sidebar')).toBeInTheDocument();
  });
});
