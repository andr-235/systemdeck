import type { DiskVolumeMetrics } from '@shared/ipc';

type StorageToolbarProps = {
  disks: DiskVolumeMetrics[];
  volumeId: string;
  status: string;
  onSelectVolume: (volumeId: string) => void;
  onStart: () => void;
  onCancel: () => void;
};

function StorageToolbar({
  disks,
  volumeId,
  status,
  onSelectVolume,
  onStart,
  onCancel,
}: StorageToolbarProps): React.JSX.Element {
  const scanning = status === 'scanning';
  return (
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
        <button type="button" className="sd-pause-button" onClick={onCancel}>
          Отменить
        </button>
      ) : status === 'idle' ? (
        <button type="button" className="sd-button sd-storage-scan" onClick={onStart}>
          Сканировать
        </button>
      ) : (
        <button type="button" className="sd-pause-button" onClick={onStart}>
          Сканировать заново
        </button>
      )}
    </div>
  );
}

export default StorageToolbar;
