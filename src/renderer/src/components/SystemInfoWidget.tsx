import { useEffect, useState } from 'react';
import type { CpuInfoResponse, SystemInfoResponse } from '@shared/ipc';
import WidgetCard from './WidgetCard';
import { formatBytes, formatUptime } from '../format';

function SystemInfoWidget(): React.JSX.Element {
  const [systemInfo, setSystemInfo] = useState<SystemInfoResponse | null>(null);
  const [cpuInfo, setCpuInfo] = useState<CpuInfoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([window.api.system.getInfo(), window.api.cpu.getInfo()]).then(
      ([systemResult, cpuResult]) => {
        if (cancelled) return;
        if (systemResult.ok) setSystemInfo(systemResult.data);
        if (cpuResult.ok) setCpuInfo(cpuResult.data);
        if (!systemResult.ok) setError(systemResult.error.message);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: Array<[string, string]> = [];
  if (systemInfo) {
    rows.push(['ОС', systemInfo.osName]);
    rows.push(['Версия', systemInfo.osVersion]);
    rows.push(['Сборка', systemInfo.osBuild]);
    rows.push(['Устройство', systemInfo.hostname]);
    rows.push(['Архитектура', systemInfo.arch]);
    rows.push(['Аптайм', formatUptime(systemInfo.uptimeSeconds)]);
    if (systemInfo.systemModel) rows.push(['Модель', systemInfo.systemModel]);
    if (systemInfo.installedRamBytes) {
      rows.push(['RAM (уст.)', formatBytes(systemInfo.installedRamBytes)]);
    }
  }
  if (cpuInfo) {
    rows.push(['CPU', cpuInfo.model]);
    rows.push(['Ядра', cpuInfo.logicalCores.toString()]);
  }

  return (
    <WidgetCard title="Система" error={error}>
      {!systemInfo && !cpuInfo && !error ? (
        <span role="presentation" className="skeleton-bar" style={{ width: 160, height: 8 }} />
      ) : (
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.map(([label, value]) => (
            <div
              key={label}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
            >
              <dt>{label}</dt>
              <dd className="sd-num" style={{ margin: 0 }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </WidgetCard>
  );
}

export default SystemInfoWidget;
