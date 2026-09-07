import type { CpuLiveMetrics } from '@shared/ipc';
import WidgetCard, { barTrackStyle } from './WidgetCard';
import MetricBar from './MetricBar';
import Sparkline from './Sparkline';

type CpuWidgetProps = {
  cpu: CpuLiveMetrics | null;
  history?: number[];
  stale: boolean;
  error: string | null;
};

function formatUsage(value: number | null): string {
  return value === null ? 'недоступно' : `${value}%`;
}

function CpuWidget({ cpu, history = [], stale, error }: CpuWidgetProps): React.JSX.Element {
  const overall = cpu?.overall ?? null;

  return (
    <WidgetCard title="CPU" stale={stale} error={error}>
      <div>
        <strong>Загрузка: </strong>
        {!cpu ? (
          <span
            role="status"
            aria-label="загрузка данных CPU"
            className="skeleton-bar"
            style={{ width: 96, height: 8 }}
          />
        ) : (
          <span className="sd-num" role="status" aria-live="polite">
            {formatUsage(overall)}
          </span>
        )}
        {cpu && (
          <MetricBar
            percent={overall}
            status
            testId="cpu-overall-fill"
            ariaLabel="статус загрузки CPU"
          />
        )}
      </div>

      {cpu && (
        <Sparkline
          values={history}
          ariaLabel={`история загрузки CPU за последние ${history.length} секунд`}
        />
      )}

      {cpu && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', gap: 8 }}>
          {cpu.perCore.map((core, i) => (
            <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
              <span className="sd-num">{core === null ? '—' : `${core}%`}</span>
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
    </WidgetCard>
  );
}

export default CpuWidget;
