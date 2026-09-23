import { useState } from 'react';
import type { DiskVolumeMetrics } from '@shared/ipc';
import StorageScanView from './StorageScanView';

type StoragePageProps = {
  disks: DiskVolumeMetrics[] | null;
};

function StoragePage({ disks }: StoragePageProps): React.JSX.Element {
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);

  if (!disks) {
    return (
      <section className="sd-page" aria-label="Хранилище">
        <h2 className="sd-page-title">Хранилище</h2>
        <span role="presentation" className="skeleton-bar" style={{ width: 200, height: 8 }} />
        <p role="status" style={{ margin: 0, fontSize: 12 }}>
          Загрузка томов…
        </p>
      </section>
    );
  }

  if (disks.length === 0) {
    return (
      <section className="sd-page" aria-label="Хранилище">
        <h2 className="sd-page-title">Хранилище</h2>
        <p role="status" style={{ margin: 0, fontSize: 12 }}>
          Нет фиксированных томов — сканирование недоступно.
        </p>
      </section>
    );
  }

  const knownIds = new Set(disks.map((d) => d.id));
  const volumeId =
    selectedVolumeId !== null && knownIds.has(selectedVolumeId)
      ? selectedVolumeId
      : (disks[0] as DiskVolumeMetrics).id;

  return <StorageScanView volumeId={volumeId} disks={disks} onSelectVolume={setSelectedVolumeId} />;
}

export default StoragePage;
