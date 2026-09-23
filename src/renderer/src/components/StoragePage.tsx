import { useState } from 'react';
import type { DiskVolumeMetrics } from '@shared/ipc';
import { useStorageScan } from '../useStorageScan';
import { formatBytes, formatDateTime } from '../format';

type StoragePageProps = {
  disks: DiskVolumeMetrics[] | null;
};

const STATUS_TEXT: Record<string, string> = {
  idle: 'Ожидание — скан не запускался',
  scanning: 'Сканирование…',
  complete: 'Готово',
  cancelled: 'Отменено',
  failed: 'Ошибка',
};

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  return (
    <span
      role="status"
      aria-label={`Статус: ${STATUS_TEXT[status] ?? status}`}
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 10,
        border: '1px solid var(--sd-color-border)',
        background: 'var(--sd-color-muted)',
        color: 'var(--sd-color-foreground)',
      }}
    >
      {STATUS_TEXT[status] ?? status}
    </span>
  );
}

type ScanViewProps = {
  volumeId: string;
  disks: DiskVolumeMetrics[];
  onSelectVolume: (volumeId: string) => void;
};

function StorageScanView({ volumeId, disks, onSelectVolume }: ScanViewProps): React.JSX.Element {
  const { state, startScan, cancelScan } = useStorageScan(volumeId);
  const scanning = state.status === 'scanning';
  const progress = scanning ? state.progress : null;

  const progressText = progress
    ? `Обработано записей: ${progress.scannedEntries} · Байт: ${formatBytes(progress.scannedBytes)} · Недоступно: ${progress.inaccessibleDirectories}`
    : 'Подготовка…';

  return (
    <section className="sd-page" aria-label="Хранилище">
      <h2 className="sd-page-title">Хранилище</h2>

      <div className="sd-storage-toolbar">
        <label className="sd-storage-label">
          <span className="sd-sr-only">Том для сканирования</span>
          <select
            aria-label="Том для сканирования"
            className="sd-storage-select"
            value={volumeId}
            disabled={scanning}
            onChange={(e) => onSelectVolume(e.target.value)}
          >
            {disks.map((disk) => (
              <option key={disk.id} value={disk.id}>
                {(disk.name ?? disk.id) + ` (${disk.id})`}
              </option>
            ))}
          </select>
        </label>
        {scanning ? (
          <button type="button" className="sd-pause-button" onClick={cancelScan}>
            Отменить
          </button>
        ) : state.status === 'idle' ? (
          <button type="button" className="sd-button sd-storage-scan" onClick={startScan}>
            Сканировать
          </button>
        ) : (
          <button type="button" className="sd-pause-button" onClick={startScan}>
            Сканировать заново
          </button>
        )}
        <StatusBadge status={state.status} />
      </div>

      {scanning && (
        <div className="sd-storage-progress" aria-live="polite">
          <div
            role="progressbar"
            aria-label="Прогресс сканирования"
            aria-valuetext={progressText}
            className="sd-progress-track"
          >
            <div
              className={
                progress ? 'sd-progress-fill sd-progress-fill-indeterminate' : 'sd-progress-fill'
              }
            />
          </div>
          <p style={{ margin: 0, fontSize: 12 }} className="sd-num">
            {progressText}
          </p>
          {progress?.currentPath ? (
            <p style={{ margin: 0, fontSize: 12 }} className="sd-num">
              Текущий путь: {progress.currentPath}
            </p>
          ) : null}
        </div>
      )}

      {state.status === 'failed' && (
        <p role="alert" style={{ margin: 0, color: 'var(--sd-color-destructive)', fontSize: 12 }}>
          Ошибка сканирования: {state.message}
        </p>
      )}
      {state.status === 'cancelled' && (
        <p role="status" style={{ margin: 0, fontSize: 12 }}>
          Сканирование отменено. Кэш предыдущего результата недоступен — запустите скан заново.
        </p>
      )}
      {state.status === 'idle' && (
        <p role="status" style={{ margin: 0, fontSize: 12 }}>
          Выберите том и нажмите «Сканировать». При входе читается кэш без авто-скана.
        </p>
      )}

      {state.status === 'complete' && (
        <p role="status" style={{ margin: 0, fontSize: 12 }} className="sd-num">
          Том {state.result.volumeId} · Всего {formatBytes(state.result.totalBytes)} · Файлов:{' '}
          {state.result.fileCount} · Недоступно каталогов: {state.result.inaccessibleDirectories} ·
          Длительность {(state.result.durationMs / 1000).toFixed(1)} с · Обновлено{' '}
          {formatDateTime(state.result.timestamp)}
        </p>
      )}

      <div className="sd-storage-layout">
        <div
          className="sd-storage-treemap"
          aria-label="Карта занятого места"
          data-testid="storage-treemap"
        >
          {state.status === 'complete' ? (
            <>
              <p style={{ margin: 0, fontSize: 12 }} className="sd-num">
                Корень: {state.result.tree.name} · Каталогов: {state.result.tree.children.length}
                {state.result.tree.inaccessible ? ' · Корень недоступен' : ''}
              </p>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
                Treemap с drill-down появится здесь (issue #39).
              </p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
              {scanning
                ? 'Карта строится по ходу сканирования…'
                : 'Запустите скан, чтобы увидеть карту занятого места.'}
            </p>
          )}
        </div>
        <aside
          className="sd-storage-sidebar"
          aria-label="Детали хранилища"
          data-testid="storage-sidebar"
        >
          {state.status === 'complete' ? (
            <>
              <p style={{ margin: 0, fontSize: 12 }} className="sd-num">
                Крупнейших файлов: {state.result.largestFiles.length} · Категорий:{' '}
                {state.result.typeTotals.length}
              </p>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
                Крупнейшие файлы и сводка по типам появятся здесь (issue #40).
              </p>
            </>
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

/**
 * Страница Storage (EPIC 4, issue #38): выбор фиксированного тома, состояния
 * idle / scanning / complete / cancelled / failed + Unavailable, прогресс с
 * отменой, чтение кэша при входе без авто-скана. Treemap и сайдбар — резервные
 * контейнеры под #39/#40. Плотный layout под окно 900×670.
 */
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
