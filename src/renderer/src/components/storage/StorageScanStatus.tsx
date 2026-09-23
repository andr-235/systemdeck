import type { StorageScanState } from '../../useStorageScan';
import { formatBytes } from '../../format';

function StorageScanStatus({ state }: { state: StorageScanState }): React.JSX.Element | null {
  if (state.status === 'scanning') {
    const progress = state.progress;
    const progressText = progress
      ? `Обработано записей: ${progress.scannedEntries} · Байт: ${formatBytes(progress.scannedBytes)} · Недоступно: ${progress.inaccessibleDirectories}`
      : 'Подготовка…';
    return (
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
    );
  }
  if (state.status === 'failed') {
    return (
      <p role="alert" style={{ margin: 0, color: 'var(--sd-color-destructive)', fontSize: 12 }}>
        Ошибка сканирования: {state.message}
      </p>
    );
  }
  if (state.status === 'cancelled') {
    return (
      <p role="status" style={{ margin: 0, fontSize: 12 }}>
        Сканирование отменено. Кэш предыдущего результата недоступен — запустите скан заново.
      </p>
    );
  }
  if (state.status === 'idle') {
    return (
      <p role="status" style={{ margin: 0, fontSize: 12 }}>
        Выберите том и нажмите «Сканировать». При входе читается кэш без авто-скана.
      </p>
    );
  }
  return null;
}

export default StorageScanStatus;
