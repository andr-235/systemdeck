import type { ScanResult } from '@shared/ipc';
import { formatBytes, formatDateTime } from '../../format';

function StorageResultSummary({ result }: { result: ScanResult }): React.JSX.Element {
  return (
    <dl className="sd-stat-grid">
      <div className="sd-stat-card">
        <dt className="sd-stat-label">Всего</dt>
        <dd className="sd-stat-value sd-num">{formatBytes(result.totalBytes)}</dd>
      </div>
      <div className="sd-stat-card">
        <dt className="sd-stat-label">Файлов</dt>
        <dd className="sd-stat-value sd-num">{result.fileCount}</dd>
      </div>
      <div className="sd-stat-card">
        <dt className="sd-stat-label">Недоступно каталогов</dt>
        <dd className="sd-stat-value sd-num">{result.inaccessibleDirectories}</dd>
      </div>
      <div className="sd-stat-card">
        <dt className="sd-stat-label">Длительность</dt>
        <dd className="sd-stat-value sd-num">{(result.durationMs / 1000).toFixed(1)} с</dd>
        <dd className="sd-stat-sub">Том {result.volumeId} · {formatDateTime(result.timestamp)}</dd>
      </div>
    </dl>
  );
}

export default StorageResultSummary;
