import { barTrackStyle } from './WidgetCard';

export const STATUS_CRIT_PERCENT = 90;
export const STATUS_WARN_PERCENT = 70;

export type StatusTone = 'ok' | 'warn' | 'crit';

export function statusTone(value: number): StatusTone {
  if (value >= STATUS_CRIT_PERCENT) return 'crit';
  if (value >= STATUS_WARN_PERCENT) return 'warn';
  return 'ok';
}

/** Текст статуса — пара к цвету: никогда не передаём состояние только цветом (dashboard.md). */
export const STATUS_LABEL: Record<StatusTone, string> = {
  ok: 'норма',
  warn: 'высокая',
  crit: 'критично',
};

/** Тёмные 700-оттенки: контраст 4.5:1 на светло-голубом фоне (P1). */
export const STATUS_TEXT_COLOR: Record<StatusTone, string> = {
  ok: 'var(--sd-color-success-strong)',
  warn: 'var(--sd-color-warn-strong)',
  crit: 'var(--sd-color-crit-strong)',
};

/** Заливка бара — токеновые цвета палитры ok/warn/crit (как у CPU). */
export const STATUS_FILL_COLOR: Record<StatusTone, string> = {
  ok: 'var(--sd-color-success)',
  warn: 'var(--sd-color-accent)',
  crit: 'var(--sd-color-destructive)',
};

type MetricBarProps = {
  percent: number | null;
  status?: boolean;
  testId?: string;
  ariaLabel?: string;
};

/** Единый статусный бар с числовым значением; null → Unavailable (не рисуем). */
function MetricBar({
  percent,
  status = false,
  testId,
  ariaLabel,
}: MetricBarProps): React.JSX.Element | null {
  if (percent === null) return null;
  const tone = statusTone(percent);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ ...barTrackStyle, flex: 1 }} role="presentation">
        <div
          data-testid={testId}
          className="cpu-widget-fill"
          style={{
            width: `${Math.min(100, percent)}%`,
            height: '100%',
            background: STATUS_FILL_COLOR[tone],
          }}
        />
      </div>
      {status && (
        <span
          aria-label={ariaLabel}
          className="sd-num"
          style={{
            fontSize: 12,
            color: STATUS_TEXT_COLOR[tone],
            whiteSpace: 'nowrap',
          }}
        >
          {STATUS_LABEL[tone]}
        </span>
      )}
    </div>
  );
}

export default MetricBar;
