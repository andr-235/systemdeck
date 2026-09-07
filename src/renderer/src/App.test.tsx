import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from './App';
import { setMockApi, makeLiveSnapshot } from './test-utils';
import type { LiveSnapshot } from '@shared/ipc';

describe('Renderer — App (jsdom project)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setMockApi({});
  });

  it('renders the SystemDeck shell without bootstrap template UI', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByRole('heading', { name: 'SystemDeck' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CPU' })).toBeInTheDocument();

    expect(screen.queryByText(/Bootstrap OK/)).not.toBeInTheDocument();
    expect(screen.queryByText(/IPC ping/)).not.toBeInTheDocument();
  });

  it('subscribes to live stream via window.api.live and renders pushed snapshot', async () => {
    const subscribe = vi.fn(async () => ({ ok: true as const, data: { intervalMs: 1000 } }));
    const capturedListeners: Array<(s: LiveSnapshot) => void> = [];
    const onLiveSnapshot = vi.fn((cb: (s: LiveSnapshot) => void) => {
      capturedListeners.push(cb);
      return () => {};
    });
    setMockApi({ subscribe, onLiveSnapshot });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => expect(subscribe).toHaveBeenCalled());

    await act(async () => {
      for (const cb of capturedListeners) {
        cb(makeLiveSnapshot({ timestamp: 1, cpu: { overall: 12.5, perCore: [12.5] } }));
      }
    });

    expect(screen.getByRole('status')).toHaveTextContent('12.5%');
    expect(screen.getAllByText('12.5%').length).toBeGreaterThanOrEqual(2);
  });

  it('navigates to the Processes page from the Shell', async () => {
    const subscribe = vi.fn(async () => ({ ok: true as const, data: { intervalMs: 1000 } }));
    setMockApi({ subscribe });

    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Процессы' }));
    });

    expect(screen.getByRole('heading', { name: 'Процессы' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Процессы' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('pause freezes displayed values until resumed', async () => {
    const subscribe = vi.fn(async () => ({ ok: true as const, data: { intervalMs: 1000 } }));
    const capturedListeners: Array<(s: LiveSnapshot) => void> = [];
    const onLiveSnapshot = vi.fn((cb: (s: LiveSnapshot) => void) => {
      capturedListeners.push(cb);
      return () => {};
    });
    setMockApi({ subscribe, onLiveSnapshot });

    const push = (timestamp: number, overall: number): void => {
      for (const cb of capturedListeners) {
        cb(makeLiveSnapshot({ timestamp, cpu: { overall, perCore: [overall] } }));
      }
    };

    await act(async () => {
      render(<App />);
    });
    await waitFor(() => expect(subscribe).toHaveBeenCalled());

    await act(async () => {
      push(1, 12.5);
    });
    expect(screen.getByRole('status')).toHaveTextContent('12.5%');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Пауза' }));
    });
    expect(screen.getByRole('button', { name: 'Продолжить' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText(/пауза/)).toBeInTheDocument();

    await act(async () => {
      push(2, 99);
    });
    expect(screen.getByRole('status')).toHaveTextContent('12.5%');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    });
    await act(async () => {
      push(3, 77);
    });
    expect(screen.getByRole('status')).toHaveTextContent('77%');
  });
});
