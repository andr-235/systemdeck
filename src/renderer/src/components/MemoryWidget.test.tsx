import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MemoryWidget from './MemoryWidget';
import type { MemoryMetrics } from '@shared/ipc';

const ok: MemoryMetrics = {
  total: 8 * 2 ** 30,
  used: 2 ** 30,
  available: 7 * 2 ** 30,
  percent: 12.5,
  swap: null,
};

function renderWidget(
  memory: MemoryMetrics | null,
  stale = false,
  error: string | null = null
): void {
  render(<MemoryWidget memory={memory} stale={stale} error={error} />);
}

describe('Renderer — MemoryWidget (jsdom project)', () => {
  afterEach(() => cleanup());

  it('renders used/total percent and free value', () => {
    renderWidget(ok);
    expect(screen.getByText('1.0 ГБ из 8.0 ГБ')).toBeInTheDocument();
    expect(screen.getByText('7.0 ГБ')).toBeInTheDocument();
    expect(screen.getByTestId('memory-fill')).toHaveStyle({ width: '12.5%' });
  });

  it('shows skeleton before the first snapshot', () => {
    renderWidget(null);
    expect(screen.queryByText('недоступно')).not.toBeInTheDocument();
  });

  it('renders null fields as unavailable, not 0', () => {
    renderWidget({ total: null, used: null, available: null, percent: null, swap: null });
    expect(screen.getAllByText('недоступно').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('renders stale marker', () => {
    renderWidget(ok, true);
    expect(screen.getByText(/данные устарели/)).toBeInTheDocument();
  });
});
