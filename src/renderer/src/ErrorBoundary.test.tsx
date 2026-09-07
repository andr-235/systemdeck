import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ErrorBoundary from './ErrorBoundary';

function Throwing(): React.JSX.Element {
  throw new Error('boom renderer');
}

describe('Renderer — ErrorBoundary (jsdom project)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders fallback and reports via window.api.reportRendererError', () => {
    const mockReport = vi.fn(async () => ({ ok: true as const, data: undefined }));
    (window as unknown as { api: Window['api'] }).api = {
      ping: vi.fn() as unknown as Window['api']['ping'],
      reportRendererError: mockReport as unknown as Window['api']['reportRendererError'],
      cpu: {
        getInfo: vi.fn() as unknown as Window['api']['cpu']['getInfo'],
        getUsage: vi.fn() as unknown as Window['api']['cpu']['getUsage'],
      },
    };

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Throwing />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    expect(screen.getByText('Перезапустить')).toBeInTheDocument();
    // fallback must not leak stack
    expect(screen.queryByText(/boom renderer/)).not.toBeInTheDocument();

    expect(mockReport).toHaveBeenCalledTimes(1);
    const arg = (mockReport.mock.calls[0] as unknown as [{ scope: string; message: string }])[0];
    expect(arg.scope).toBe('renderer');
    expect(arg.message).toBe('boom renderer');

    consoleSpy.mockRestore();
  });

  it('does not render fallback when child is healthy', () => {
    render(
      <ErrorBoundary>
        <div>healthy</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('healthy')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
