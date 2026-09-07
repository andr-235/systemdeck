import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SystemModuleUnavailable from './SystemModuleUnavailable';

const originalLocation = window.location;

describe('Renderer — SystemModuleUnavailable (jsdom project)', () => {
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('shows concise SystemDeck error without raw JS details', () => {
    render(<SystemModuleUnavailable />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Не удалось запустить системный модуль/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перезапустить' })).toBeInTheDocument();
    // никаких сырых javascript-ошибок/стектрейсов
    expect(screen.queryByText(/Cannot read properties of undefined/)).not.toBeInTheDocument();
    expect(screen.queryByText(/window.api/)).not.toBeInTheDocument();
  });

  it('reloads the window on retry', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    });

    render(<SystemModuleUnavailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Перезапустить' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
