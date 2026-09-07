import type { NetworkInterfaceMetrics } from '@shared/ipc';
import WidgetCard from './WidgetCard';
import { formatRate } from '../format';

type NetworkWidgetProps = {
  network: NetworkInterfaceMetrics[] | null;
  stale: boolean;
  error: string | null;
};

function NetworkWidget({ network, stale, error }: NetworkWidgetProps): React.JSX.Element {
  return (
    <WidgetCard title="Сеть" stale={stale} error={error}>
      {!network ? (
        <span role="presentation" className="skeleton-bar" style={{ width: 160, height: 8 }} />
      ) : network.length === 0 ? (
        <span style={{ fontSize: 12 }}>Нет активных интерфейсов</span>
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
          {network.map((iface) => (
            <li key={iface.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 12 }}>
                <strong>{iface.name}</strong>
              </div>
              <div className="sd-num" style={{ fontSize: 12 }}>
                ↓ {formatRate(iface.rxBytesPerSec)} · ↑ {formatRate(iface.txBytesPerSec)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

export default NetworkWidget;
