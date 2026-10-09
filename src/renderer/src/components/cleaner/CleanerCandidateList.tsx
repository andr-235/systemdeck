import type { CleanerPreviewResponse } from '@shared/ipc/contracts';
import { formatBytes } from '../../format';
import { pluralRu, staleHint } from './cleanerText';
import type { CleanerStaleReason } from './useCleaner';
import CleanerCandidateTable from './CleanerCandidateTable';
import CleanerSelectionToolbar from './CleanerSelectionToolbar';

type CleanerCandidateListProps = {
  preview: CleanerPreviewResponse;
  selectedIds: ReadonlySet<string>;
  selectedCount: number;
  selectedEstimatedBytes: number;
  stale: boolean;
  staleReason: CleanerStaleReason | null;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onRequestDelete: () => void;
};

function CleanerCandidateList({
  preview,
  selectedIds,
  selectedCount,
  selectedEstimatedBytes,
  stale,
  staleReason,
  onToggle,
  onToggleAll,
  onRequestDelete,
}: CleanerCandidateListProps): React.JSX.Element {
  return (
    <>
      <div className="sd-storage-head">
        <h3 className="sd-page-title">Кандидаты на удаление</h3>
        <span className="sd-hint">Оценка preview: {formatBytes(preview.estimatedBytes)}</span>
      </div>
      {stale && staleReason && (
        <p role="status" className="sd-hint">
          {staleHint(staleReason)}
        </p>
      )}
      {preview.candidates.length === 0 ? (
        <p role="status" className="sd-hint">
          Кандидаты не найдены — удалять нечего.
        </p>
      ) : (
        <CleanerCandidateTable
          preview={preview}
          selectedIds={selectedIds}
          stale={stale}
          onToggle={onToggle}
        />
      )}
      <CleanerSelectionToolbar
        total={preview.candidates.length}
        selectedCount={selectedCount}
        selectedEstimatedBytes={selectedEstimatedBytes}
        stale={stale}
        onToggleAll={onToggleAll}
        onRequestDelete={onRequestDelete}
      />
      {selectedCount > 0 && (
        <p className="sd-hint">
          Выбрано для удаления: {pluralRu(selectedCount, 'элемент', 'элемента', 'элементов')}.
          Удаление необратимо.
        </p>
      )}
    </>
  );
}

export default CleanerCandidateList;
