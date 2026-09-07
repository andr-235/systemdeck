import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ConfirmDialog from './ConfirmDialog';

function renderDialog(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}): void {
  render(
    <ConfirmDialog
      open={false}
      title="Завершить процесс"
      message="Это действие необратимо"
      confirmLabel="Завершить"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      {...props}
    />
  );
}

describe('Renderer — ConfirmDialog (jsdom project)', () => {
  afterEach(() => cleanup());

  it('renders nothing when closed', () => {
    renderDialog();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders title, message and action buttons when open', () => {
    renderDialog({ open: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Завершить процесс')).toBeInTheDocument();
    expect(screen.getByText('Это действие необратимо')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Завершить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    renderDialog({ open: true, onConfirm });
    fireEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel via the cancel button', () => {
    const onCancel = vi.fn();
    renderDialog({ open: true, onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Escape is pressed', () => {
    const onCancel = vi.fn();
    renderDialog({ open: true, onCancel });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
