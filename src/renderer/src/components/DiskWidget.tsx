import type { DiskVolumeMetrics } from '@shared/ipc';
import WidgetCard from './WidgetCard';
import MetricBar from './MetricBar';
import { formatBytes } from '../format';

type DiskWidgetProps = {
  disks: DiskVolumeMetrics[] | null;
  stale: boolean;
  error: string | null;
};

function DiskWidget({ disks, stale, error }: DiskWidgetProps): React.JSX.Element {
  return (
    <WidgetCard title="Диски" stale={stale} error={error}>
      {!disks ? (
        <span role="presentation" className="skeleton-bar" style={{ width: 160, height: 8 }} />
      ) : disks.length === 0 ? (
        <span style={{ fontSize: 12 }}>Нет данных о дисковых томах</span>
      ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {disks.map((disk) => (
            <li key={disk.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 12 }}>
                <strong>{disk.name ?? disk.id}</strong>
                {disk.fileSystem ? ` (${disk.fileSystem})` : ''}
              </div>
              <div className="sd-num" style={{ fontSize: 12 }}>
                {disk.used === null || disk.free === null
                  ? 'занято: недоступно'
                  : `занято ${formatBytes(disk.used)} из ${formatBytes(disk.total)} · свободно ${formatBytes(disk.free)}`}
              </div>
              <MetricBar percent={disk.percent} status />
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

export default DiskWidget;
