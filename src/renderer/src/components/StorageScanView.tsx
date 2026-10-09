import type { DiskVolumeMetrics } from '@shared/ipc';
import { useStorageScan } from '../useStorageScan';
import StorageToolbar from './storage/StorageToolbar';
import StorageScanStatus from './storage/StorageScanStatus';
import StorageResultSummary from './storage/StorageResultSummary';
import StorageStatusBadge from './storage/StorageStatusBadge';
import StorageLayout from './StorageLayout';

type StorageScanViewProps = {
  volumeId: string;
  disks: DiskVolumeMetrics[];
  onSelectVolume: (volumeId: string) => void;
};

function StorageScanView({
  volumeId,
  disks,
  onSelectVolume,
}: StorageScanViewProps): React.JSX.Element {
  const { state, startScan, cancelScan } = useStorageScan(volumeId);
  return (
    <section className="sd-page" aria-label="Хранилище">
      <div className="sd-storage-head">
        <h2 className="sd-page-title">Хранилище</h2>
        <StorageStatusBadge status={state.status} />
      </div>
      <section className="sd-card" aria-label="Управление сканированием">
        <StorageToolbar
          disks={disks}
          volumeId={volumeId}
          status={state.status}
          onSelectVolume={onSelectVolume}
          onStart={startScan}
          onCancel={cancelScan}
        />
        <StorageScanStatus state={state} />
      </section>
      <section className="sd-card" aria-label="Итоги сканирования">
        {state.status === 'complete' ? (
          <StorageResultSummary result={state.result} />
        ) : (
          <>
            <span role="presentation" className="skeleton-bar" style={{ width: 160, height: 8 }} />
            <p className="sd-hint">Итоги появятся после завершения скана.</p>
          </>
        )}
      </section>
      <StorageLayout state={state} />
    </section>
  );
}

export default StorageScanView;
