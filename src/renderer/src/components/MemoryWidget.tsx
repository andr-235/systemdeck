import type { MemoryMetrics } from '@shared/ipc';
import WidgetCard from './WidgetCard';
import MetricBar from './MetricBar';
import Sparkline from './Sparkline';
import { formatBytes } from '../format';

type MemoryWidgetProps = {
  memory: MemoryMetrics | null;
  history?: number[];
  stale: boolean;
  error: string | null;
};

function unavailOr(value: number | null, formatter: (v: number) => string): string {
  return value === null ? 'недоступно' : formatter(value);
}

function MemoryWidget({
  memory,
  history = [],
  stale,
  error,
}: MemoryWidgetProps): React.JSX.Element {
  const total = memory?.total ?? null;
  const used = memory?.used ?? null;
  const percent = memory?.percent ?? null;
  const swap = memory?.swap ?? null;

  return (
    <WidgetCard title="Память" stale={stale} error={error}>
      {!memory ? (
        <span role="presentation" className="skeleton-bar" style={{ width: 160, height: 8 }} />
      ) : (
        <>
          <div>
            <strong>Занято: </strong>
            <span className="sd-num" aria-live="polite">
              {unavailOr(used, (v) => `${formatBytes(v)} из ${formatBytes(total ?? 0)}`)}
            </span>
          </div>
          <MetricBar
            percent={percent}
            status
            testId="memory-fill"
            ariaLabel="уровень занятости памяти"
          />
          <Sparkline
            values={history}
            ariaLabel={`история занятости памяти за последние ${history.length} секунд`}
          />
          <div style={{ fontSize: 12 }}>
            <strong>Свободно: </strong>
            <span className="sd-num">{unavailOr(memory.available, formatBytes)}</span>
          </div>
          <div style={{ fontSize: 12 }}>
            <strong>Файл подкачки: </strong>
            <span className="sd-num">
              {swap ? `${formatBytes(swap.used)} из ${formatBytes(swap.total)}` : 'недоступно'}
            </span>
          </div>
        </>
      )}
    </WidgetCard>
  );
}

export default MemoryWidget;
