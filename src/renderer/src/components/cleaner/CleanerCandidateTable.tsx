import type { CleanerPreviewResponse } from '@shared/ipc/contracts';
import { sourceStatusLabel } from './cleanerText';
import CleanerCandidateRow from './CleanerCandidateRow';

type CleanerCandidateTableProps = {
  preview: CleanerPreviewResponse;
  selectedIds: ReadonlySet<string>;
  stale: boolean;
  onToggle: (id: string) => void;
};

function CleanerCandidateTable({
  preview,
  selectedIds,
  stale,
  onToggle,
}: CleanerCandidateTableProps): React.JSX.Element {
  const statusByCategory = new Map(
    preview.sources.map((item) => [item.category, sourceStatusLabel(item.status)])
  );
  return (
    <table className="sd-cleaner-table">
      <thead>
        <tr>
          <th scope="col">Выбор</th>
          <th scope="col">Категория</th>
          <th scope="col">Источник</th>
          <th scope="col">Путь</th>
          <th scope="col">Размер</th>
          <th scope="col">Возраст</th>
          <th scope="col">Статус</th>
        </tr>
      </thead>
      <tbody>
        {preview.candidates.map((candidate) => (
          <CleanerCandidateRow
            key={candidate.id}
            candidate={candidate}
            checked={selectedIds.has(candidate.id)}
            disabled={stale}
            sourceStatusText={statusByCategory.get(candidate.category) ?? '—'}
            onToggle={onToggle}
          />
        ))}
      </tbody>
    </table>
  );
}

export default CleanerCandidateTable;
