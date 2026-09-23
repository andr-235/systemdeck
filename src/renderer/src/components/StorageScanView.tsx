import type { DiskVolumeMetrics } from '@shared/ipc';
import { useStorageScan } from '../useStorageScan';
import StorageToolbar from './storage/StorageToolbar';
import StorageScanStatus from './storage/StorageScanStatus';
import StorageResultSummary from './storage/StorageResultSummary';
import StorageTreemap from './treemap/StorageTreemap';
import StorageSidebar from './storage/StorageSidebar';

const STATUS_TEXT: Record<string, string> = {
  idle: 'Ожидание — скан не запускался',
  scanning: 'Сканирование…',
  complete: 'Готово',
  cancelled: 'Отменено',
  failed: 'Ошибка',
};

type StorageScanViewProps = {
  volumeId: string;
  disks: DiskVolumeMetrics[];
  onSelectVolume: (volumeId: string) => void;
};

function StorageScanView({ volumeId, disks, onSelectVolume }: StorageScanViewProps): React.JSX.Element {
  const { state, startScan, cancelScan } = useStorageScan(volumeId);
  const scanning = state.status === 'scanning';
  return (
    <section className="sd-page" aria-label="Хранилище">
      <div className="sd-storage-head">
        <h2 className="sd-page-title">Хранилище</h2>
        <span
          role="status"
          aria-label={`Статус: ${STATUS_TEXT[state.status] ?? state.status}`}
          className="sd-status-badge"
        >
          {STATUS_TEXT[state.status] ?? state.status}
        </span>
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
      {state.status === 'complete' && (
        <section className="sd-card" aria-label="Итоги сканирования">
          <StorageResultSummary result={state.result} />
        </section>
      )}
      <div className="sd-storage-layout">
        <div className="sd-storage-treemap" aria-label="Карта занятого места" data-testid="storage-treemap">
          {state.status === 'complete' ? (
            <StorageTreemap tree={state.result.tree} />
          ) : (
            <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
              {scanning
                ? 'Карта строится по ходу сканирования…'
                : 'Запустите скан, чтобы увидеть карту занятого места.'}
            </p>
          )}
        </div>
        <aside className="sd-storage-sidebar" aria-label="Детали хранилища" data-testid="storage-sidebar">
          {state.status === 'complete' ? (
            <StorageSidebar result={state.result} />
          ) : (
            <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
              {scanning
                ? 'Сводка появится после завершения скана…'
                : 'Здесь появятся крупнейшие файлы и сводка по типам.'}
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

export default StorageScanView;
