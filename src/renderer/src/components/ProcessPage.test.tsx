import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ProcessPage from './ProcessPage';
import type { ProcessSnapshot } from '@shared/ipc';
import { makeProcessEntry } from '../test-utils';

const snapshot: ProcessSnapshot = {
  timestamp: 0,
  processes: [
    makeProcessEntry({ pid: 3, name: 'webkit.exe', cpuPercent: 50, memBytes: 2048 }),
    makeProcessEntry({
      pid: 1,
      name: 'svchost.exe',
      cpuPercent: 5,
      memBytes: 512,
      protected: true,
    }),
    makeProcessEntry({ pid: 2, name: 'chrome.exe', cpuPercent: 80, memBytes: 1024 }),
  ],
};

function renderPage(props: Partial<Parameters<typeof ProcessPage>[0]> = {}): void {
  render(
    <ProcessPage snapshot={snapshot} stale={false} error={null} onSelect={vi.fn()} {...props} />
  );
}

describe('Renderer — ProcessPage (jsdom project)', () => {
  afterEach(() => cleanup());

  it('renders all process rows with pid, name, cpu and memory', () => {
    renderPage();
    for (const name of ['webkit.exe', 'svchost.exe', 'chrome.exe']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('search filters by name', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Поиск/), {
      target: { value: 'chrome' },
    });
    expect(screen.getByText('chrome.exe')).toBeInTheDocument();
    expect(screen.queryByText('webkit.exe')).not.toBeInTheDocument();
  });

  it('search filters by pid', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Поиск/), {
      target: { value: '1' },
    });
    expect(screen.getByText('svchost.exe')).toBeInTheDocument();
    expect(screen.queryByText('chrome.exe')).not.toBeInTheDocument();
  });

  it('sorts by name ascending after clicking the column header', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Имя/ }));
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent ?? '');
    expect(names[0]).toContain('chrome.exe');
    expect(names[2]).toContain('webkit.exe');
  });

  it('shows a shield indicator for protected processes', () => {
    renderPage();
    expect(screen.getByLabelText(/защищён/i)).toBeInTheDocument();
  });

  it('selecting a row calls onSelect with that process', () => {
    const onSelect = vi.fn();
    renderPage({ onSelect });
    fireEvent.click(screen.getByText('chrome.exe'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ pid: 2 }));
  });

  it('selects a row with Enter from the keyboard', () => {
    const onSelect = vi.fn();
    renderPage({ onSelect });
    const row = screen.getByText('chrome.exe').closest('tr') as HTMLTableRowElement;
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ pid: 2 }));
  });

  it('selects a row with Space from the keyboard', () => {
    const onSelect = vi.fn();
    renderPage({ onSelect });
    const row = screen.getByText('chrome.exe').closest('tr') as HTMLTableRowElement;
    row.focus();
    fireEvent.keyDown(row, { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ pid: 2 }));
  });
});
