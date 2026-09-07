import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from './App';
import { setMockApi } from './test-utils';
import type { IpcResult, PingResponse } from '@shared/ipc';

describe('Renderer — App (jsdom project)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders SystemDeck heading and IPC ping success', async () => {
    const mockPing = vi.fn(async (): Promise<IpcResult<PingResponse>> => ({
      ok: true,
      data: { pong: true, contractVersion: 'sd-003', timestamp: 1234567890 },
    }));
    setMockApi({ ping: mockPing });

    render(<App />);

    expect(screen.getByText('SystemDeck')).toBeInTheDocument();
    expect(screen.getByText(/Bootstrap OK/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/pong: true/)).toBeInTheDocument();
    });
    expect(mockPing).toHaveBeenCalledTimes(1);
  });

  it('renders error when ping returns IpcResult ok:false', async () => {
    const mockPing = vi.fn(async (): Promise<IpcResult<PingResponse>> => ({
      ok: false,
      error: { code: 'UNKNOWN', message: 'ping failed' },
    }));
    setMockApi({ ping: mockPing });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/error: UNKNOWN/)).toBeInTheDocument();
    });
  });
});
