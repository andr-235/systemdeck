import { formatBytes } from '../../format';

type CleanerSelectionToolbarProps = {
  total: number;
  selectedCount: number;
  selectedEstimatedBytes: number;
  stale: boolean;
  onToggleAll: () => void;
  onRequestDelete: () => void;
};

function CleanerSelectionToolbar({
  total,
  selectedCount,
  selectedEstimatedBytes,
  stale,
  onToggleAll,
  onRequestDelete,
}: CleanerSelectionToolbarProps): React.JSX.Element {
  const allSelected = total > 0 && selectedCount === total;
  return (
    <div className="sd-cleaner-toolbar">
      <label className="sd-cleaner-option">
        <input
          type="checkbox"
          checked={allSelected}
          disabled={stale || total === 0}
          onChange={onToggleAll}
          aria-label="Выбрать все"
        />
        Выбрать все
      </label>
      <span className="sd-hint" role="status">
        Выбрано: {selectedCount} · оценка {formatBytes(selectedEstimatedBytes)}
      </span>
      <button
        type="button"
        className="sd-danger-button"
        onClick={onRequestDelete}
        disabled={selectedCount === 0 || stale}
      >
        Удалить…
      </button>
    </div>
  );
}

export default CleanerSelectionToolbar;
