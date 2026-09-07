import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import DiskWidget from './DiskWidget';
import type { DiskVolumeMetrics } from '@shared/ipc';

const volume: DiskVolumeMetrics = {
  id: 'C:',
  name: 'System',
  fileSystem: 'NTFS',
  total: 500,
  used: 300,
  free: 200,
  percent: 60,
};

const unavailableFree: DiskVolumeMetrics = {
  id: 'D:',
  name: null,
  fileSystem: null,
  total: 1000,
  used: null,
  free: null,
  percent: null,
};

function renderWidget(
  disks: DiskVolumeMetrics[] | null,
  stale = false,
  error: string | null = null
): void {
  render(<DiskWidget disks={disks} stale={stale} error={error} />);
}

describe('Renderer — DiskWidget (jsdom project)', () => {
  afterEach(() => cleanup());

  it('renders volumes with used/free and percent bar', () => {
    renderWidget([volume]);
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('(NTFS)')).toBeInTheDocument();
    expect(screen.getByText(/занято 300 Б из 500 Б/)).toBeInTheDocument();
  });

  it('renders unavailable free as text, not a fabricated 0', () => {
    renderWidget([unavailableFree]);
    expect(screen.getByText(/занято: недоступно/)).toBeInTheDocument();
    expect(screen.queryByText(/свободно 0/)).not.toBeInTheDocument();
  });

  it('shows empty note when disk list is empty', () => {
    renderWidget([]);
    expect(screen.getByText('Нет данных о дисковых томах')).toBeInTheDocument();
  });

  it('shows skeleton before the first snapshot', () => {
    renderWidget(null);
    expect(screen.queryByText('Нет данных о дисковых томах')).not.toBeInTheDocument();
  });
});
