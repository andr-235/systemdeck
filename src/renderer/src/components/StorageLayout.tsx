import type { StorageScanState } from '../useStorageScan';
import StorageTreemap from './treemap/StorageTreemap';
import StorageSidebar from './storage/StorageSidebar';

type StorageLayoutProps = {
  state: StorageScanState;
};

function StorageLayout({ state }: StorageLayoutProps): React.JSX.Element {
  const scanning = state.status === 'scanning';
  const complete = state.status === 'complete';
  return (
    <div className="sd-storage-layout">
      <div
        className="sd-storage-treemap sd-card"
        aria-label="Карта занятого места"
        data-testid="storage-treemap"
      >
        {complete ? (
          <StorageTreemap tree={state.result.tree} />
        ) : (
          <p className="sd-hint">
            {scanning
              ? 'Карта строится по ходу сканирования…'
              : 'Запустите скан, чтобы увидеть карту занятого места.'}
          </p>
        )}
      </div>
      <aside
        className="sd-storage-sidebar sd-card"
        aria-label="Детали хранилища"
        data-testid="storage-sidebar"
      >
        {complete ? (
          <StorageSidebar result={state.result} />
        ) : (
          <p className="sd-hint">
            {scanning
              ? 'Сводка появится после завершения скана…'
              : 'Здесь появятся крупнейшие файлы и сводка по типам.'}
          </p>
        )}
      </aside>
    </div>
  );
}

export default StorageLayout;
