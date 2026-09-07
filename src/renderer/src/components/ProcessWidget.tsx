import type { ProcessSnapshot } from '@shared/ipc';
import WidgetCard from './WidgetCard';
import { formatBytes } from '../format';

type ProcessWidgetProps = {
  processSnapshot: ProcessSnapshot | null;
  stale: boolean;
  error: string | null;
};

function ProcessWidget({ processSnapshot, stale, error }: ProcessWidgetProps): React.JSX.Element {
  const processes = processSnapshot?.processes ?? null;

  return (
    <WidgetCard title="Процессы" stale={stale} error={error}>
      {!processes ? (
        <span role="presentation" className="skeleton-bar" style={{ width: 160, height: 8 }} />
      ) : processes.length === 0 ? (
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
            {processes.map((p) => (
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
                  {p.cpuPercent}
                </td>
                <td className="sd-num" style={{ textAlign: 'right', padding: '2px 4px' }}>
                  {formatBytes(p.memBytes)}
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
