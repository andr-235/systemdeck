import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ProcessWidget from './ProcessWidget';
import type { ProcessSnapshot } from '@shared/ipc';
import { makeProcessEntry, makeProcessSnapshot } from '../test-utils';

const snapshot: ProcessSnapshot = {
  timestamp: 0,
  processes: [
    makeProcessEntry({
      pid: 1,
      name: 'sys',
      cpuPercent: 10.5,
      memBytes: 4096,
      execPath: 'C:\\sys.exe',
      protected: true,
      commandLine: 'sys.exe --quiet',
      threadCount: 3,
      creationTime: Date.UTC(2025, 0, 1),
      parentPid: null,
    }),
  ],
};

function renderWidget(processSnapshot: ProcessSnapshot | null): void {
  render(<ProcessWidget processSnapshot={processSnapshot} stale={false} error={null} />);
}

describe('Renderer — ProcessWidget (jsdom project)', () => {
  afterEach(() => cleanup());

  it('renders process rows with pid, name, cpu and memory', () => {
    renderWidget(snapshot);
    expect(screen.getByText('sys')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('10.5')).toBeInTheDocument();
  });

  it('shows empty note when process snapshot is empty', () => {
    renderWidget({ timestamp: 0, processes: [] });
    expect(screen.getByText('Нет данных о процессах')).toBeInTheDocument();
  });

  it('shows only the top processes by CPU% in the summary', () => {
    const six = makeProcessSnapshot({
      processes: [
        makeProcessEntry({ pid: 1, name: 'a.exe', cpuPercent: 1 }),
        makeProcessEntry({ pid: 2, name: 'b.exe', cpuPercent: 80 }),
        makeProcessEntry({ pid: 3, name: 'c.exe', cpuPercent: 30 }),
        makeProcessEntry({ pid: 4, name: 'd.exe', cpuPercent: 40 }),
        makeProcessEntry({ pid: 5, name: 'e.exe', cpuPercent: 55 }),
        makeProcessEntry({ pid: 6, name: 'f.exe', cpuPercent: 90 }),
      ],
    });
    renderWidget(six);
    for (const name of ['f.exe', 'b.exe', 'e.exe', 'd.exe', 'c.exe']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.queryByText('a.exe')).not.toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
  });
});
