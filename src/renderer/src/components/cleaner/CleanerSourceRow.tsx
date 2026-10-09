import type { CleanupPreviewSource } from '@shared/ipc/contracts';
import { formatBytes } from '../../format';
import { categoryLabel, pluralRu, sourceStatusLabel } from './cleanerText';

function CleanerSourceRow({ source }: { source: CleanupPreviewSource }): React.JSX.Element {
  const unavailable = source.status === 'unavailable';
  return (
    <li className="sd-cleaner-source-row">
      <span>{categoryLabel(source.category)}</span>
      <span className="sd-status-badge">{sourceStatusLabel(source.status)}</span>
      <span className="sd-num">
        {unavailable
          ? '—'
          : `${pluralRu(source.candidateCount, 'кандидат', 'кандидата', 'кандидатов')} · ${formatBytes(source.estimatedBytes)}`}
      </span>
      {source.inaccessibleDirectories > 0 && (
        <span className="sd-hint">Недоступных каталогов: {source.inaccessibleDirectories}</span>
      )}
      {source.reason && <span className="sd-hint">Причина: {source.reason}</span>}
      {source.minAgeHours !== undefined && (
        <span className="sd-hint">Возраст файлов: от {source.minAgeHours} ч</span>
      )}
    </li>
  );
}

export default CleanerSourceRow;
