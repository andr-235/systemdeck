import type { CleanupProgressEvent } from '@shared/ipc/contracts';
import { formatBytes } from '../../format';
import { phaseLabel } from './cleanerText';

type RunningProgress = Extract<CleanupProgressEvent, { status: 'running' }>;

type CleanerProgressViewProps = {
  progress: RunningProgress | null;
  operationId: string | null;
  cancelRequested: boolean;
  stale: boolean;
  onCancel: () => void;
};

function CleanerProgressView({
  progress,
  operationId,
  cancelRequested,
  stale,
  onCancel,
}: CleanerProgressViewProps): React.JSX.Element {
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 0;
  return (
    <div className="sd-storage-progress">
      <p role="status" className="sd-hint">
        {progress
          ? `${phaseLabel(progress.phase)}: ${progress.processed} из ${progress.total}`
          : 'Ожидание события прогресса…'}
      </p>
      <div className="sd-progress-track" aria-hidden="true">
        <div className="sd-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="sd-hint">
        Операция: {operationId ?? '—'} · освобождено:{' '}
        {progress ? formatBytes(progress.freedBytes) : '—'}
      </p>
      <div className="sd-cleaner-toolbar">
        <button
          type="button"
          className="sd-danger-button"
          onClick={onCancel}
          disabled={!operationId || cancelRequested}
        >
          {cancelRequested ? 'Отмена запрошена…' : 'Отменить'}
        </button>
        <span className="sd-hint">
          Отмена останавливает остаток работы; уже удалённые файлы не возвращаются.
        </span>
        {stale && (
          <span role="status" className="sd-hint">
            Прогресс устарел — события не поступают.
          </span>
        )}
      </div>
    </div>
  );
}

export default CleanerProgressView;
