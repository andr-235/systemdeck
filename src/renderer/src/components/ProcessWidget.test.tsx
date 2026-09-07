import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ProcessWidget from './ProcessWidget';
import type { ProcessSnapshot } from '@shared/ipc';

const snapshot: ProcessSnapshot = {
  timestamp: 0,
  processes: [
    {
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
    },
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
});
