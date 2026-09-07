import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import CpuWidget from './CpuWidget';
import { setMockApi } from '../test-utils';
import type { CpuInfoResponse, CpuUsageResponse, IpcResult } from '@shared/ipc';

const infoOk: CpuInfoResponse = {
  model: 'Intel Core i7-13700',
  clockMhz: 5100,
  logicalCores: 16,
  physicalCores: 8,
};

const usageOk: CpuUsageResponse = {
  overall: 42.5,
  perCore: [50, 35],
  timestamp: 1000,
};

describe('Renderer — CpuWidget (jsdom project)', () => {
  beforeEach(() => {
    setMockApi({});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders static CPU info from getInfo', async () => {
    const getInfo = vi.fn(async (): Promise<IpcResult<CpuInfoResponse>> => ({
      ok: true,
      data: infoOk,
    }));
    setMockApi({ getInfo });

    render(<CpuWidget />);

    await waitFor(() => {
      expect(screen.getByText(/Intel Core i7-13700/)).toBeInTheDocument();
    });
    expect(screen.getByText(/16 логических ядер/)).toBeInTheDocument();
    expect(screen.getByText(/8 физических/)).toBeInTheDocument();
    expect(screen.getByText(/5100 МГц/)).toBeInTheDocument();
  });

  it('shows unavailable mark when physical cores null, not guessed', async () => {
    const getInfo = vi.fn(async (): Promise<IpcResult<CpuInfoResponse>> => ({
      ok: true,
      data: { ...infoOk, physicalCores: null },
    }));
    setMockApi({ getInfo });

    render(<CpuWidget />);

    await waitFor(() => {
      expect(screen.getByText(/физические ядра: недоступно/)).toBeInTheDocument();
    });
  });

  it('renders live overall utilization and per-core bars', async () => {
    const getUsage = vi.fn(async (): Promise<IpcResult<CpuUsageResponse>> => ({
      ok: true,
      data: usageOk,
    }));
    setMockApi({ getUsage });

    render(<CpuWidget />);

    await waitFor(() => {
      expect(screen.getByText('42.5%')).toBeInTheDocument();
    });
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
  });

  it('repolls usage on interval (second tick updates value)', async () => {
    vi.useFakeTimers();
    const getUsage = vi.fn(async (): Promise<IpcResult<CpuUsageResponse>> => ({
      ok: true,
      data: usageOk,
    }));
    setMockApi({ getUsage });

    render(<CpuWidget />);

    // flush initial promise chain started inside useEffect
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getUsage).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(getUsage).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('renders error state when cpu:usage returns ok:false', async () => {
    const getUsage = vi.fn(async (): Promise<IpcResult<CpuUsageResponse>> => ({
      ok: false,
      error: { code: 'INTERNAL', message: 'cpu boom' },
    }));
    setMockApi({ getUsage });

    render(<CpuWidget />);

    await waitFor(() => {
      expect(screen.getByText(/cpu boom/)).toBeInTheDocument();
    });
  });

  it('shows null baseline (first usage tick) as unavailable, not 0', async () => {
    const getUsage = vi.fn(async (): Promise<IpcResult<CpuUsageResponse>> => ({
      ok: true,
      data: { overall: null, perCore: [null, null], timestamp: 1000 },
    }));
    setMockApi({ getUsage });

    render(<CpuWidget />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('недоступно');
    });
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('shows loading skeleton before the first usage response', () => {
    const never = vi.fn(async () => new Promise<IpcResult<CpuUsageResponse>>(() => {}));
    setMockApi({ getUsage: never });

    render(<CpuWidget />);

    expect(screen.getByRole('status', { name: 'загрузка данных CPU' })).toBeInTheDocument();
    expect(screen.queryByText('недоступно')).not.toBeInTheDocument();
  });

  it('colors overall bar by status thresholds (warn >=70, crit >=90), value stays visible as text', async () => {
    const cases: Array<{ overall: number; color: string }> = [
      { overall: 30, color: 'var(--sd-color-success)' },
      { overall: 75, color: 'var(--sd-color-accent)' },
      { overall: 95, color: 'var(--sd-color-destructive)' },
    ];

    for (const { overall, color } of cases) {
      cleanup();
      const getUsage = vi.fn(async (): Promise<IpcResult<CpuUsageResponse>> => ({
        ok: true,
        data: { overall, perCore: [overall], timestamp: 1000 },
      }));
      setMockApi({ getUsage });

      render(<CpuWidget />);

      await waitFor(() => {
        expect(screen.getByTestId('cpu-overall-fill')).toHaveStyle({
          background: color,
          width: `${overall}%`,
        });
      });
      expect(screen.getByRole('status')).toHaveTextContent(`${overall}%`);
    }
  });
});
