import { useEffect, useRef } from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element | null {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          background: 'var(--sd-color-surface)',
          border: '1px solid var(--sd-color-border)',
          borderRadius: 12,
          padding: 'var(--sd-space-2xl)',
          maxWidth: 420,
          display: 'grid',
          gap: 'var(--sd-space-md)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
        <div role="status" style={{ fontSize: 13, opacity: 0.8 }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              border: '1px solid var(--sd-color-border)',
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              padding: '6px 12px',
              color: 'var(--sd-color-foreground)',
              minHeight: 32,
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              border: 'none',
              borderRadius: 6,
              background: 'var(--sd-color-danger, #d33)',
              color: '#fff',
              cursor: 'pointer',
              padding: '6px 12px',
              minHeight: 32,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
