import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import type {
  CleanupPreviewSource,
  CleanupProgressEvent,
  CleanupReport,
  CleanerPreviewResponse,
} from '@shared/ipc';
import type { IpcResult } from '@shared/ipc/errors';
import CleanerPage from './CleanerPage';
import {
  makeCleanupPreview,
  makePreviewCandidate,
  makeRunningProgress,
  makeTerminalProgress,
  setMockApi,
} from '../../test-utils';

type PreviewResolver = (result: IpcResult<CleanerPreviewResponse>) => void;

type Harness = {
  push: (event: CleanupProgressEvent) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
  resolvers: PreviewResolver[];
};

const PATH_A = 'C:\\Users\\user\\AppData\\Local\\Temp\\a.tmp';
const PATH_B = 'C:\\Users\\user\\AppData\\Local\\Temp\\b.tmp';
const PATH_BIN = 'C:\\$Recycle.Bin\\doc.txt';
const PATH_NEW = 'C:\\Users\\user\\AppData\\Local\\Temp\\new.tmp';

function makeSource(
  overrides: Partial<CleanupPreviewSource> & { category: CleanupPreviewSource['category'] }
): CleanupPreviewSource {
  return {
    status: 'ok',
    candidateCount: 0,
    estimatedBytes: 0,
    inaccessibleDirectories: 0,
    ...overrides,
  };
}

function defaultPreview(): CleanerPreviewResponse {
  return makeCleanupPreview({
    sessionId: 'session-1',
    candidates: [
      makePreviewCandidate({ id: 'a1', path: PATH_A, sizeBytes: 1024, category: 'user-temp' }),
      makePreviewCandidate({ id: 'a2', path: PATH_B, sizeBytes: 2048, category: 'user-temp' }),
      makePreviewCandidate({ id: 'r1', path: PATH_BIN, sizeBytes: 4096, category: 'recycle-bin' }),
    ],
    estimatedBytes: 7168,
    sources: [
      makeSource({ category: 'user-temp', candidateCount: 2, estimatedBytes: 3072 }),
      makeSource({ category: 'recycle-bin', candidateCount: 1, estimatedBytes: 4096 }),
    ],
  });
}

function setup(options: { previews?: CleanerPreviewResponse[]; deferred?: boolean } = {}): Harness {
  const previews = [...(options.previews ?? [defaultPreview()])];
  const harness: Harness = { push: () => undefined, unsubscribe: vi.fn(), resolvers: [] };
  setMockApi({
    cleanerOnProgress: vi.fn((callback: (event: CleanupProgressEvent) => void) => {
      harness.push = callback;
      return harness.unsubscribe;
    }),
    cleanerPreview: vi.fn(() => {
      if (options.deferred) {
        return new Promise<IpcResult<CleanerPreviewResponse>>((resolve) => {
          harness.resolvers.push(resolve);
        });
      }
      const data = previews.length > 1 ? previews.shift() : previews[0];
      return Promise.resolve<IpcResult<CleanerPreviewResponse>>({
        ok: true,
        data: data ?? makeCleanupPreview(),
      });
    }),
    cleanerDelete: vi.fn(() =>
      Promise.resolve<IpcResult<{ operationId: string }>>({
        ok: true,
        data: { operationId: 'op-1' },
      })
    ),
    cleanerCancel: vi.fn(() => Promise.resolve<IpcResult<void>>({ ok: true, data: undefined })),
  });
  return harness;
}

async function renderReady(): Promise<void> {
  render(<CleanerPage />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр' }));
  });
  await screen.findByText('Кандидаты на удаление');
}

function select(path: string): void {
  fireEvent.click(screen.getByRole('checkbox', { name: `Выбрать ${path}` }));
}

/** Выбор и явное подтверждение: delete вызывается только после кнопки в диалоге. */
function confirmDelete(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Удалить…' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Удалить \d/ }));
}

function statValue(label: string): string {
  const card = screen.getByText(label).closest('.sd-stat-card');
  return card?.querySelector('.sd-stat-value')?.textContent ?? '';
}

const mixedReport: CleanupReport = {
  items: [
    { path: PATH_A, outcome: 'deleted', bytesFreed: 512 },
    { path: PATH_B, outcome: 'skipped', bytesFreed: 0, code: 'CLEAN_FILE_IN_USE' },
    {
      path: PATH_BIN,
      outcome: 'failed',
      bytesFreed: 0,
      error: { code: 'EIO', message: 'Access is denied' },
    },
  ],
  total: 3,
  deleted: 1,
  skipped: 1,
  failed: 1,
  freedBytes: 512,
};

describe('cleaner — CleanerPage (jsdom project)', () => {
  it('never deletes without selection and explicit confirmation', async () => {
    setup();
    await renderReady();

    const deleteButton = screen.getByRole('button', { name: 'Удалить…' });
    expect(deleteButton).toBeDisabled();

    select(PATH_A);
    const checkbox = screen.getByRole('checkbox', { name: `Выбрать ${PATH_A}` });
    checkbox.focus();
    expect(document.activeElement).toBe(checkbox);
    expect(deleteButton).toBeEnabled();

    fireEvent.click(deleteButton);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(window.api.cleaner.delete).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.api.cleaner.delete).not.toHaveBeenCalled();
  });

  it('shows the confirmation scope, estimate and recycle warning with focus inside', async () => {
    setup();
    await renderReady();
    select(PATH_A);
    select(PATH_BIN);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить…' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Будет удалено: 2 элемента');
    expect(dialog).toHaveTextContent('Категории: Временные файлы пользователя, Корзина');
    expect(dialog).toHaveTextContent('Оценка размера: 5.0 КБ');
    expect(dialog).toHaveTextContent('корзина очищается одной агрегированной операцией');
    expect(dialog).toHaveTextContent('Удаление необратимо');

    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Удалить 2 элемента' })
    );
    expect(window.api.cleaner.delete).not.toHaveBeenCalled();
  });

  it('sends only ids of the fresh session after a re-preview', async () => {
    setup({
      previews: [
        defaultPreview(),
        makeCleanupPreview({
          sessionId: 'session-2',
          candidates: [
            makePreviewCandidate({
              id: 'n1',
              path: PATH_NEW,
              sizeBytes: 512,
              category: 'user-temp',
            }),
          ],
          estimatedBytes: 512,
          sources: [makeSource({ category: 'user-temp', candidateCount: 1, estimatedBytes: 512 })],
        }),
      ],
    });
    await renderReady();
    select(PATH_A);
    expect(screen.getByRole('button', { name: 'Удалить…' })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр' }));
    });
    await screen.findByText(PATH_NEW);
    expect(screen.queryByRole('checkbox', { name: `Выбрать ${PATH_A}` })).toBeNull();
    expect(screen.getByRole('button', { name: 'Удалить…' })).toBeDisabled();

    select(PATH_NEW);
    confirmDelete();
    await waitFor(() => expect(window.api.cleaner.delete).toHaveBeenCalledTimes(1));
    expect(window.api.cleaner.delete).toHaveBeenCalledWith({
      sessionId: 'session-2',
      candidateIds: ['n1'],
    });
    const sent = vi.mocked(window.api.cleaner.delete).mock.calls[0]?.[0];
    expect(sent?.sessionId).not.toBe('session-1');
  });

  it('separates ok, empty, partial and unavailable sources without fake zero bytes', async () => {
    setup({
      previews: [
        makeCleanupPreview({
          sessionId: 'session-1',
          candidates: [
            makePreviewCandidate({
              id: 'a1',
              path: PATH_A,
              sizeBytes: 1024,
              category: 'user-temp',
            }),
          ],
          estimatedBytes: 1024,
          sources: [
            makeSource({ category: 'user-temp', candidateCount: 1, estimatedBytes: 1024 }),
            makeSource({
              category: 'windows-temp',
              status: 'unavailable',
              reason: 'Каталог недоступен: отказано в доступе',
              inaccessibleDirectories: 2,
            }),
            makeSource({ category: 'thumbnail-cache', status: 'empty' }),
            makeSource({
              category: 'browser-cache',
              status: 'partial',
              candidateCount: 1,
              estimatedBytes: 512,
              inaccessibleDirectories: 1,
              reason: 'Часть профилей недоступна',
            }),
          ],
        }),
      ],
    });
    await renderReady();
    const list = screen.getByRole('list', { name: 'Состояние источников' });
    const row = (name: string): HTMLElement | null => within(list).getByText(name).closest('li');

    const unavailable = row('Временные файлы Windows');
    expect(unavailable).toHaveTextContent('Недоступно');
    expect(unavailable).toHaveTextContent('Причина: Каталог недоступен: отказано в доступе');
    expect(unavailable).toHaveTextContent('Недоступных каталогов: 2');
    expect(unavailable).not.toHaveTextContent('0 Б');
    expect(unavailable).toHaveTextContent('—');

    const empty = row('Кэш эскизов');
    expect(empty).toHaveTextContent('Кандидатов нет');

    const partial = row('Кэш браузеров');
    expect(partial).toHaveTextContent('Частично доступно');
    expect(partial).toHaveTextContent('1 кандидат · 512 Б');

    expect(row('Временные файлы пользователя')).toHaveTextContent('Готово');
  });

  it('shows a distinct scanning state while the preview request is pending', async () => {
    const harness = setup({ deferred: true });
    render(<CleanerPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр' }));
    });

    expect(screen.getByRole('button', { name: 'Сканирование…' })).toBeDisabled();
    expect(screen.getByText('Сканирование разрешённых каталогов…')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Статус: Сканирование…' })).toBeInTheDocument();

    await act(async () => {
      harness.resolvers[0]?.({ ok: true, data: defaultPreview() });
    });
    await screen.findByText('Кандидаты на удаление');
  });

  it('shows an explicit empty result without enabling deletion', async () => {
    setup({
      previews: [
        makeCleanupPreview({
          sessionId: 'session-1',
          candidates: [],
          estimatedBytes: 0,
          sources: [makeSource({ category: 'user-temp', status: 'empty' })],
        }),
      ],
    });
    await renderReady();

    expect(screen.getByText('Кандидаты не найдены — удалять нечего.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Удалить…' })).toBeDisabled();
  });

  it('blocks every action while cleaning and finishes with the unchanged cancelled report', async () => {
    const harness = setup();
    await renderReady();
    select(PATH_A);
    confirmDelete();
    await screen.findByText('Ожидание события прогресса…');

    expect(screen.queryByRole('button', { name: 'Удалить…' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Предпросмотр' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Корзина' })).toBeDisabled();

    act(() => {
      harness.push(makeRunningProgress({ processed: 1, total: 3, freedBytes: 512 }));
    });
    expect(screen.getByText('Удаление: 1 из 3')).toBeInTheDocument();
    expect(screen.getByText(/Операция: op-1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    await waitFor(() =>
      expect(window.api.cleaner.cancel).toHaveBeenCalledWith({ operationId: 'op-1' })
    );
    expect(screen.getByRole('button', { name: 'Отмена запрошена…' })).toBeDisabled();

    act(() => {
      harness.push(makeTerminalProgress('cancelled', { report: mixedReport }));
    });
    await screen.findByText('Отчёт об очистке');
    expect(
      screen.getByText('Очистка отменена — уже удалённое не возвращается.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/все выбранные элементы удалены/i)).not.toBeInTheDocument();

    expect(statValue('Всего в отчёте')).toBe('3');
    expect(statValue('Удалено')).toBe('1');
    expect(statValue('Пропущено')).toBe('1');
    expect(statValue('Ошибок')).toBe('1');
    expect(statValue('Оценка размера')).toBe('1.0 КБ');
    expect(statValue('Фактически освобождено')).toBe('512 Б');

    const skippedRow = screen.getByText(PATH_B).closest('tr');
    expect(skippedRow).toHaveTextContent('Пропущен');
    expect(skippedRow).toHaveTextContent('файл занят другим процессом');
    const failedRow = screen.getByText(PATH_BIN).closest('tr');
    expect(failedRow).toHaveTextContent('Ошибка');
    expect(failedRow).toHaveTextContent('Access is denied');
  });

  it('reports a partial completion without a full-success claim', async () => {
    const harness = setup();
    await renderReady();
    select(PATH_A);
    confirmDelete();
    await screen.findByText('Ожидание события прогресса…');

    act(() => {
      harness.push(makeTerminalProgress('completed', { report: mixedReport }));
    });
    await screen.findByText('Отчёт об очистке');
    expect(
      screen.getByText('Частично: удалено 1, пропущено 1, ошибок 1 из 3.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/все выбранные элементы удалены/i)).not.toBeInTheDocument();
    expect(statValue('Фактически освобождено')).toBe('512 Б');
  });

  it('ignores a late push of the finished operation after a new preview', async () => {
    const harness = setup({
      previews: [
        defaultPreview(),
        makeCleanupPreview({
          sessionId: 'session-2',
          candidates: [
            makePreviewCandidate({
              id: 'n1',
              path: PATH_NEW,
              sizeBytes: 512,
              category: 'user-temp',
            }),
          ],
          estimatedBytes: 512,
          sources: [makeSource({ category: 'user-temp', candidateCount: 1, estimatedBytes: 512 })],
        }),
      ],
    });
    await renderReady();
    select(PATH_A);
    confirmDelete();
    await screen.findByText('Ожидание события прогресса…');
    act(() => {
      harness.push(makeTerminalProgress('completed', { report: mixedReport }));
    });
    await screen.findByText('Отчёт об очистке');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр' }));
    });
    await screen.findByText('Кандидаты на удаление');

    act(() => {
      harness.push(makeRunningProgress({ processed: 3, total: 3 }));
      harness.push(
        makeTerminalProgress('completed', {
          report: { items: [], total: 9, deleted: 9, skipped: 0, failed: 0, freedBytes: 9999 },
        })
      );
    });

    expect(screen.getByText('Кандидаты на удаление')).toBeInTheDocument();
    expect(screen.getByText(PATH_NEW)).toBeInTheDocument();
    expect(screen.queryByText('Отчёт об очистке')).toBeNull();
  });

  it('marks the preview stale and clears the selection when categories change', async () => {
    setup();
    await renderReady();
    select(PATH_A);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Журналы Windows' }));

    expect(
      screen.getByText('Категории изменены — выполните сканирование заново.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Удалить…' })).toBeDisabled();
    const checkbox = screen.getByRole('checkbox', { name: `Выбрать ${PATH_A}` });
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
  });

  it('releases the progress subscription when the page unmounts', async () => {
    const harness = setup();
    const { unmount } = render(<CleanerPage />);
    await waitFor(() => expect(window.api.cleaner.onProgress).toHaveBeenCalledTimes(1));
    expect(harness.unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
