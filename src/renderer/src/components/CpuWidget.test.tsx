import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import CpuWidget from './CpuWidget';
import type { CpuLiveMetrics } from '@shared/ipc';

const usageOk: CpuLiveMetrics = {
  overall: 42.5,
  perCore: [50, 35],
};

function renderWidget(
  cpu: CpuLiveMetrics | null | undefined,
  stale = false,
  error: string | null = null
): void {
  render(<CpuWidget cpu={cpu ?? null} stale={stale} error={error} />);
}

describe('Renderer — CpuWidget (jsdom project)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders live overall utilization and per-core bars', () => {
    renderWidget(usageOk);

    expect(screen.getByText('42.5%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
  });

  it('shows loading skeleton before first snapshot arrives', () => {
    renderWidget(undefined);

    expect(screen.getByRole('status', { name: 'загрузка данных CPU' })).toBeInTheDocument();
    expect(screen.queryByText('недоступно')).not.toBeInTheDocument();
  });

  it('shows null overall as unavailable, not 0%', () => {
    renderWidget({ overall: null, perCore: [null, null] });

    expect(screen.getByRole('status')).toHaveTextContent('недоступно');
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('renders stale marker when snapshot timestamp is old', () => {
    renderWidget(usageOk, true);

    expect(screen.getByText(/данные устарели/)).toBeInTheDocument();
  });

  it('renders error state when subscription failed', () => {
    renderWidget(usageOk, false, 'live boom');

    expect(screen.getByText(/live boom/)).toBeInTheDocument();
  });

  it('colors overall bar by status thresholds (warn >=70, crit >=90), value stays visible as text', () => {
    const cases: Array<{ overall: number; color: string }> = [
      { overall: 30, color: 'var(--sd-color-success)' },
      { overall: 75, color: 'var(--sd-color-accent)' },
      { overall: 95, color: 'var(--sd-color-destructive)' },
    ];

    for (const { overall, color } of cases) {
      cleanup();
      renderWidget({ overall, perCore: [overall] });

      expect(screen.getByTestId('cpu-overall-fill')).toHaveStyle({
        background: color,
        width: `${overall}%`,
      });
      expect(screen.getByRole('status')).toHaveTextContent(`${overall}%`);
    }
  });

  it('pairs a text status label with the bar (state is never color-only)', () => {
    const cases: Array<{ overall: number; label: string }> = [
      { overall: 30, label: 'норма' },
      { overall: 75, label: 'высокая' },
      { overall: 95, label: 'критично' },
    ];

    for (const { overall, label } of cases) {
      cleanup();
      renderWidget({ overall, perCore: [overall] });
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
