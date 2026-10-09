import type { CleanupPreviewCandidate } from '@shared/ipc/contracts';
import { formatBytes } from '../../format';
import { categoryLabel, candidateSource, formatAge } from './cleanerText';

type CleanerCandidateRowProps = {
  candidate: CleanupPreviewCandidate;
  checked: boolean;
  disabled: boolean;
  sourceStatusText: string;
  onToggle: (id: string) => void;
};

function CleanerCandidateRow({
  candidate,
  checked,
  disabled,
  sourceStatusText,
  onToggle,
}: CleanerCandidateRowProps): React.JSX.Element {
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={() => onToggle(candidate.id)}
          aria-label={`Выбрать ${candidate.path}`}
        />
      </td>
      <td>{categoryLabel(candidate.category)}</td>
      <td>{candidateSource(candidate)}</td>
      <td className="sd-cleaner-path" title={candidate.path}>
        {candidate.path}
      </td>
      <td className="sd-num">{formatBytes(candidate.sizeBytes)}</td>
      <td>{formatAge(candidate.mtimeMs, Date.now())}</td>
      <td>{sourceStatusText}</td>
    </tr>
  );
}

export default CleanerCandidateRow;
