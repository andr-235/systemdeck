import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ProcessDetails from './ProcessDetails';
import type { ProcessEntry } from '@shared/ipc';
import { setMockApi } from '../test-utils';

const entry: ProcessEntry = {
  pid: 4242,
  name: 'chrome.exe',
  cpuPercent: 12.5,
  memBytes: 1048576,
  execPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  protected: false,
  commandLine: 'chrome.exe --type=renderer --enable-features=X',
  threadCount: 7,
  creationTime: Date.UTC(2025, 0, 1, 10, 30, 0),
  parentPid: 1000,
};

const protectedEntry: ProcessEntry = { ...entry, name: 'lsass.exe', protected: true };

function renderDetails(props: Partial<Parameters<typeof ProcessDetails>[0]> = {}): void {
  render(
    <ProcessDetails
      entry={entry}
      selectedPid={entry.pid}
      stale={false}
      onClear={vi.fn()}
      {...props}
    />
  );
}

describe('Renderer — ProcessDetails (jsdom project)', () => {
  afterEach(() => {
    cleanup();
    setMockApi();
  });

  it('renders the rich metadata for a selected process', () => {
    renderDetails();
    expect(screen.getByText('chrome.exe')).toBeInTheDocument();
    expect(screen.getByText(/--type=renderer/)).toBeInTheDocument();
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText(/1\.0 МБ/)).toBeInTheDocument();
    expect(screen.getByText(/C:\\Program Files/)).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
  });

  it('shows creation time as a formatted date', () => {
    renderDetails();
    expect(screen.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it('marks protected processes and shows a warning', () => {
    renderDetails({ entry: protectedEntry });
    expect(screen.getByText(/защищённ/i)).toBeInTheDocument();
  });

  it('shows an empty state when nothing is selected', () => {
    renderDetails({ selectedPid: null });
    expect(screen.getByText(/выберите процесс/i)).toBeInTheDocument();
  });

  it('shows a gone state when the selected process disappeared', () => {
    renderDetails({ entry: null, selectedPid: 4242 });
    expect(screen.getByText(/завершён|не найден/i)).toBeInTheDocument();
  });

  it('calls onClear when the close button is clicked', () => {
    const onClear = vi.fn();
    renderDetails({ onClear });
    fireEvent.click(screen.getByRole('button', { name: /закрыть/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it('shows the End Process control enabled for a regular process', () => {
    renderDetails();
    const button = screen.getByRole('button', { name: /завершить процесс/i });
    expect(button).toBeEnabled();
  });

  it('disables the End Process control for protected processes', () => {
    renderDetails({ entry: protectedEntry });
    expect(screen.getByRole('button', { name: /завершить процесс/i })).toBeDisabled();
  });

  it('asks for confirmation before terminating', () => {
    renderDetails();
    fireEvent.click(screen.getByRole('button', { name: /завершить процесс/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.textContent).toContain('chrome.exe');
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('terminates the process via window.api and clears the selection on success', async () => {
    const onClear = vi.fn();
    const terminateProcess = vi.fn(async () => ({ ok: true as const, data: undefined }));
    setMockApi({ terminateProcess });
    renderDetails({ onClear });
    fireEvent.click(screen.getByRole('button', { name: /завершить процесс/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(terminateProcess).toHaveBeenCalledWith(entry.pid);
    await vi.waitFor(() => expect(onClear).toHaveBeenCalled());
  });

  it('shows an error and keeps the selection when termination fails', async () => {
    const onClear = vi.fn();
    const terminateProcess = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'ACCESS_DENIED', message: 'Отказано в доступе' },
    }));
    setMockApi({ terminateProcess });
    renderDetails({ onClear });
    fireEvent.click(screen.getByRole('button', { name: /завершить процесс/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(await screen.findByText(/отказано в доступе/i)).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('marks details as stale when the snapshot is stale', () => {
    renderDetails({ stale: true });
    expect(screen.getByText(/данные устарели/i)).toBeInTheDocument();
  });

  it('disables the control and ignores further clicks while a termination is in flight', async () => {
    const onClear = vi.fn();
    let release: () => void = () => {};
    const terminateProcess = vi.fn(
      () =>
        new Promise<{ ok: true; data: undefined }>((resolve) => {
          release = () => resolve({ ok: true, data: undefined });
        })
    );
    setMockApi({ terminateProcess });
    renderDetails({ onClear });
    fireEvent.click(screen.getByRole('button', { name: /завершить процесс/i }));
    fireEvent.click(screen.getByRole('button', { name: /завершить$/i }));
    expect(terminateProcess).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /завершить процесс/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /завершить процесс/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    release();
    await vi.waitFor(() => expect(terminateProcess).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(onClear).toHaveBeenCalled());
  });
});
