import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ProcessPage from './ProcessPage';
import type { ProcessSnapshot } from '@shared/ipc';
import { makeProcessEntry } from '../test-utils';

const snapshot: ProcessSnapshot = {
  timestamp: 0,
  processes: [
    makeProcessEntry({ pid: 3, name: 'webkit.exe', cpuPercent: 50, workingSetBytes: 2048 }),
    makeProcessEntry({
      pid: 1,
      name: 'svchost.exe',
      cpuPercent: 5,
      workingSetBytes: 512,
      protected: true,
    }),
    makeProcessEntry({ pid: 2, name: 'chrome.exe', cpuPercent: 80, workingSetBytes: 1024 }),
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

describe('Renderer — ProcessPage grouping (EPIC 3)', () => {
  const groupedSnapshot: ProcessSnapshot = {
    timestamp: 0,
    processes: [
      makeProcessEntry({
        pid: 1,
        name: 'chrome.exe',
        cpuPercent: 10,
        workingSetBytes: 100,
        execPath: 'C:\\chrome.exe',
      }),
      makeProcessEntry({
        pid: 2,
        name: 'chrome.exe',
        cpuPercent: 20,
        workingSetBytes: 300,
        execPath: 'C:\\chrome.exe',
      }),
      makeProcessEntry({
        pid: 3,
        name: 'notepad.exe',
        cpuPercent: 5,
        workingSetBytes: 50,
        execPath: 'C:\\notepad.exe',
      }),
    ],
  };

  function renderGrouped(props: Partial<Parameters<typeof ProcessPage>[0]> = {}): void {
    render(
      <ProcessPage
        snapshot={groupedSnapshot}
        stale={false}
        error={null}
        onSelect={vi.fn()}
        {...props}
      />
    );
  }

  function getGroupName(): HTMLElement {
    const found = screen
      .getAllByText('chrome.exe')
      .find((el) => !el.classList.contains('sd-member-name'));
    if (!found) throw new Error('group name not found');
    return found;
  }

  function getMemberRows(): HTMLTableRowElement[] {
    return screen
      .getAllByRole('row')
      .filter((r) => r.querySelector('.sd-member-name') !== null) as HTMLTableRowElement[];
  }

  afterEach(() => cleanup());

  it('renders a multi-process application as one group row', () => {
    renderGrouped();
    // шапка + 2 группы (без строк-членов)
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('chrome.exe')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('shows the aggregate memory and the member count badge', () => {
    renderGrouped();
    expect(screen.getByText('400 Б')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: '.sd-group-badge' })).toBeInTheDocument();
    expect(screen.getByLabelText('2 процесса')).toBeInTheDocument();
  });

  it('hides member rows until the group is expanded', () => {
    renderGrouped();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('expands a group on click to reveal member rows', () => {
    renderGrouped();
    fireEvent.click(getGroupName());
    expect(screen.getAllByRole('row')).toHaveLength(5);
    expect(getMemberRows()).toHaveLength(2);
  });

  it('collapses an expanded group on a second click', () => {
    renderGrouped();
    fireEvent.click(getGroupName());
    expect(screen.getAllByRole('row')).toHaveLength(5);
    fireEvent.click(getGroupName());
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('selects a member process when its row is clicked', () => {
    const onSelect = vi.fn();
    renderGrouped({ onSelect });
    fireEvent.click(getGroupName());
    // члены сортируются по CPU% desc: сначала pid 2 (20%), затем pid 1 (10%)
    fireEvent.click(getMemberRows()[0] as HTMLTableRowElement);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ pid: 2 }));
  });

  it('selects a member with the Enter key', () => {
    const onSelect = vi.fn();
    renderGrouped({ onSelect });
    fireEvent.click(getGroupName());
    const memberRow = getMemberRows()[0] as HTMLTableRowElement;
    memberRow.focus();
    fireEvent.keyDown(memberRow, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ pid: 2 }));
  });

  it('shows a shield when a process inside the group is protected', () => {
    render(
      <ProcessPage
        snapshot={{
          timestamp: 0,
          processes: [
            {
              ...makeProcessEntry({
                pid: 1,
                name: 'svchost.exe',
                execPath: 'C:\\Windows\\svchost.exe',
              }),
              protected: true,
            },
            makeProcessEntry({
              pid: 2,
              name: 'svchost.exe',
              execPath: 'C:\\Windows\\svchost.exe',
              cpuPercent: 20,
              workingSetBytes: 300,
            }),
          ],
        }}
        stale={false}
        error={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/защищён/i)).toBeInTheDocument();
  });
});
