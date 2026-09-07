import { useEffect, useState } from 'react';
import type { GpuInfoAdapter, GpuUtilizationEntry } from '@shared/ipc';
import WidgetCard from './WidgetCard';
import MetricBar from './MetricBar';

type GpuWidgetProps = {
  gpu: GpuUtilizationEntry[] | null;
  stale: boolean;
  error: string | null;
};

function GpuWidget({ gpu, stale, error }: GpuWidgetProps): React.JSX.Element {
  const [adapters, setAdapters] = useState<GpuInfoAdapter[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.gpu.getInfo().then((result) => {
      if (cancelled || !result.ok) return;
      setAdapters(result.data.adapters);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WidgetCard title="GPU" stale={stale} error={error}>
      {!gpu ? (
        <span role="presentation" className="skeleton-bar" style={{ width: 160, height: 8 }} />
      ) : gpu.length === 0 ? (
        <span style={{ fontSize: 12 }}>GPU недоступен</span>
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
          {gpu.map((entry, i) => {
            const name = adapters?.[i]?.name ?? `GPU ${i + 1}`;
            const utilization = entry.utilization;
            return (
              <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 12 }}>
                  <strong>{name}</strong>
                  <span className="sd-num" style={{ marginLeft: 8 }}>
                    {utilization === null ? 'недоступно' : `${utilization}%`}
                  </span>
                </div>
                <MetricBar percent={utilization} status />
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}

export default GpuWidget;
