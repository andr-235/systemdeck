import type { ReactNode } from 'react';

export const cardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: '1px solid var(--sd-color-border)',
  background: 'var(--sd-color-background)',
  color: 'var(--sd-color-foreground)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 280,
};

export const barTrackStyle: React.CSSProperties = {
  height: 8,
  borderRadius: 4,
  background: 'var(--sd-color-muted)',
  overflow: 'hidden',
};

type WidgetCardProps = {
  title: string;
  ariaLabel?: string;
  stale?: boolean;
  error?: string | null;
  children: ReactNode;
};

/** Общая оболочка виджета: карточка, заголовок и единые статусы Откуда данные устарели/ошибка. */
function WidgetCard({
  title,
  ariaLabel,
  stale = false,
  error = null,
  children,
}: WidgetCardProps): React.JSX.Element {
  return (
    <section style={cardStyle} aria-label={ariaLabel ?? title}>
      <h2 style={{ margin: 0, fontSize: 14 }}>{title}</h2>
      {stale && (
        <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--sd-color-accent)' }}>
          данные устарели
        </p>
      )}
      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--sd-color-destructive)', fontSize: 12 }}>
          {title}: {error}
        </p>
      )}
      {children}
    </section>
  );
}

export default WidgetCard;
