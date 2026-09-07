import { useMemo } from 'react';
import type { ProcessSnapshot } from '@shared/ipc';
import WidgetCard from './WidgetCard';
import { formatBytes, formatPercent } from '../format';

const TOP_PROCESSES = 5;

type ProcessWidgetProps = {
  processSnapshot: ProcessSnapshot | null;
  stale: boolean;
  error: string | null;
};

function ProcessWidget({ processSnapshot, stale, error }: ProcessWidgetProps): React.JSX.Element {
  const processes = processSnapshot?.processes ?? null;

  const summary = useMemo(() => {
    if (!processes) return null;
    return [...processes]
      .filter((p) => p.cpuPercent !== null) // Unavailable без дельты исключаем из топа
      .sort((a, b) => (b.cpuPercent as number) - (a.cpuPercent as number))
      .slice(0, TOP_PROCESSES);
  }, [processes]);

  const rows = summary ?? [];
  const empty = processes !== null && summary !== null && summary.length === 0;

  return (
    <WidgetCard title="Процессы" stale={stale} error={error}>
      {!summary ? (
        <span role="presentation" className="skeleton-bar" style={{ width: 160, height: 8 }} />
      ) : empty ? (
        <span style={{ fontSize: 12 }}>Нет данных о процессах</span>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left', padding: '2px 4px' }}>
                PID
              </th>
              <th scope="col" style={{ textAlign: 'left', padding: '2px 4px' }}>
                Имя
              </th>
              <th scope="col" style={{ textAlign: 'right', padding: '2px 4px' }}>
                CPU%
              </th>
              <th scope="col" style={{ textAlign: 'right', padding: '2px 4px' }}>
                Память
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.pid}>
                <td className="sd-num" style={{ padding: '2px 4px' }}>
                  {p.pid}
                </td>
                <td
                  style={{
                    padding: '2px 4px',
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.name}
                </td>
                <td className="sd-num" style={{ textAlign: 'right', padding: '2px 4px' }}>
                  {formatPercent(p.cpuPercent)}
                </td>
                <td className="sd-num" style={{ textAlign: 'right', padding: '2px 4px' }}>
                  {formatBytes(p.workingSetBytes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WidgetCard>
  );
}

export default ProcessWidget;
