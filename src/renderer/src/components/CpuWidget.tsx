import { useEffect, useState } from 'react';
import type { CpuInfoResponse, CpuUsageResponse } from '@shared/ipc';

const POLL_INTERVAL_MS = 1000;

const cardStyle: React.CSSProperties = {
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

const barTrackStyle: React.CSSProperties = {
  height: 8,
  borderRadius: 4,
  background: 'var(--sd-color-muted)',
  overflow: 'hidden',
};

function formatUsage(value: number | null): string {
  return value === null ? 'недоступно' : `${value}%`;
}

function overallStatusColor(value: number): string {
  if (value >= 90) return 'var(--sd-color-destructive)';
  if (value >= 70) return 'var(--sd-color-accent)';
  return 'var(--sd-color-success)';
}

function CpuWidget(): React.JSX.Element {
  const [info, setInfo] = useState<CpuInfoResponse | null>(null);
  const [usage, setUsage] = useState<CpuUsageResponse | null>(null);
  const [usageReceived, setUsageReceived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let usageTimer: number | undefined;
    let infoTimer: number | undefined;

    async function pollUsage(): Promise<void> {
      const result = await window.api.cpu.getUsage();
      if (cancelled) return;
      if (result.ok) {
        setUsage(result.data);
        setUsageReceived(true);
        setError(null);
      } else {
        setError(result.error.message);
      }
      usageTimer = window.setTimeout(() => {
        void pollUsage();
      }, POLL_INTERVAL_MS);
    }

    async function loadInfo(): Promise<void> {
      const result = await window.api.cpu.getInfo();
      if (cancelled) return;
      if (result.ok) {
        setInfo(result.data);
        return;
      }
      // info кэшируется в Main — ретрай дёшев, отсутствие считается временным
      infoTimer = window.setTimeout(() => {
        void loadInfo();
      }, POLL_INTERVAL_MS);
    }

    void pollUsage();
    void loadInfo();

    return () => {
      cancelled = true;
      if (usageTimer !== undefined) window.clearTimeout(usageTimer);
      if (infoTimer !== undefined) window.clearTimeout(infoTimer);
    };
  }, []);

  const overall = usage?.overall ?? null;

  return (
    <section style={cardStyle} aria-label="CPU">
      <h2 style={{ margin: 0, fontSize: 14 }}>CPU</h2>

      {info && (
        <p style={{ margin: 0, fontSize: 12 }}>
          {info.model || 'модель неизвестна'} · {info.logicalCores} логических ядер ·{' '}
          {info.physicalCores === null
            ? 'физические ядра: недоступно'
            : `${info.physicalCores} физических`}{' '}
          · {info.clockMhz} МГц
        </p>
      )}

      <div>
        <strong>Загрузка: </strong>
        {!usageReceived ? (
          <span
            role="status"
            aria-label="загрузка данных CPU"
            className="skeleton-bar"
            style={{ width: 96, height: 8 }}
          />
        ) : (
          <span role="status" aria-live="polite">
            {formatUsage(overall)}
          </span>
        )}
        {usageReceived && overall !== null && (
          <div style={{ ...barTrackStyle, marginTop: 4 }} role="presentation">
            <div
              data-testid="cpu-overall-fill"
              className="cpu-widget-fill"
              style={{
                width: `${Math.min(100, overall)}%`,
                height: '100%',
                background: overallStatusColor(overall),
              }}
            />
          </div>
        )}
      </div>

      {usageReceived && usage && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', gap: 8 }}>
          {usage.perCore.map((core, i) => (
            <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
              <span>{core === null ? '—' : `${core}%`}</span>
              <div style={{ ...barTrackStyle, width: 24 }}>
                <div
                  className="cpu-widget-fill"
                  style={{
                    width: '100%',
                    height: `${core === null ? 0 : Math.min(100, core)}%`,
                    background: 'var(--sd-color-secondary)',
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--sd-color-destructive)', fontSize: 12 }}>
          CPU: {error}
        </p>
      )}
    </section>
  );
}

export default CpuWidget;
