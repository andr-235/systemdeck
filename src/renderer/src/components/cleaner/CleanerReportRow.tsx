import type { CleanupItemResult } from '@shared/ipc/contracts';
import { formatBytes } from '../../format';
import { itemReason, outcomeLabel } from './cleanerText';

function CleanerReportRow({ item }: { item: CleanupItemResult }): React.JSX.Element {
  const freed = item.outcome === 'deleted' ? formatBytes(item.bytesFreed) : '—';
  const reason =
    item.outcome === 'deleted'
      ? '—'
      : itemReason(
          item.outcome,
          item.outcome === 'skipped' ? item.code : item.error.code,
          item.outcome === 'skipped' ? '' : item.error.message
        );
  return (
    <tr>
      <td className="sd-cleaner-path" title={item.path}>
        {item.path}
      </td>
      <td>{outcomeLabel(item.outcome)}</td>
      <td className="sd-num">{freed}</td>
      <td>{reason}</td>
    </tr>
  );
}

export default CleanerReportRow;
