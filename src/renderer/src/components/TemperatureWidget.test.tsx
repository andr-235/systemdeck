import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TemperatureWidget from './TemperatureWidget';
import type { TemperatureEntry } from '@shared/ipc';

function renderWidget(temperatures: TemperatureEntry[] | null): void {
  render(<TemperatureWidget temperatures={temperatures} stale={false} error={null} />);
}

describe('Renderer — TemperatureWidget (jsdom project)', () => {
  afterEach(() => cleanup());

  it('renders sensor values in Celsius', () => {
    renderWidget([{ sensor: 'THM1', valueC: 62 }]);
    expect(screen.getByText('THM1')).toBeInTheDocument();
    expect(screen.getByText('62°C')).toBeInTheDocument();
  });

  it('degrades gracefully to unavailable text when probe returned nothing', () => {
    renderWidget([]);
    expect(screen.getByText(/Температуры недоступны/)).toBeInTheDocument();
    expect(screen.queryByText('0°C')).not.toBeInTheDocument();
  });
});
