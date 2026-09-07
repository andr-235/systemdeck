import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from './App';
import { setMockApi } from './test-utils';

describe('Renderer — App (jsdom project)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setMockApi({});
  });

  it('renders the SystemDeck shell without bootstrap template UI', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'SystemDeck' })).toBeInTheDocument();
    // настоящая карточка CPU монтируется в dashboard
    expect(screen.getByRole('heading', { name: 'CPU' })).toBeInTheDocument();

    // дождаться первого тика CPU — сеттеры виджета выполняются внутри act()
    await waitFor(() => {
      expect(screen.getByText('недоступно')).toBeInTheDocument();
    });

    // bootstrap/дебаг-маркеры не должны показываться в продуктовом UI
    expect(screen.queryByText(/Bootstrap OK/)).not.toBeInTheDocument();
    expect(screen.queryByText(/IPC ping/)).not.toBeInTheDocument();
  });
});
