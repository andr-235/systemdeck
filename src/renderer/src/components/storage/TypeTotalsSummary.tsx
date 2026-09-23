import { useMemo } from 'react';
import type { FileTypeTotal } from '@shared/ipc';
import { formatBytes } from '../../format';
import { scanEmptyText } from './scanEmptyText';

type TypeTotalsSummaryProps = {
  totals: FileTypeTotal[];
  totalBytes: number;
  fileCount: number;
  inaccessibleDirectories: number;
};

function formatShare(sizeBytes: number, totalBytes: number): string {
  if (!Number.isFinite(sizeBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) return '—';
  return `${((sizeBytes / totalBytes) * 100).toFixed(1)}%`;
}

function TypeTotalsSummary({
  totals,
  totalBytes,
  fileCount,
  inaccessibleDirectories,
}: TypeTotalsSummaryProps): React.JSX.Element {
  const sorted = useMemo(() => [...totals].sort((a, b) => b.sizeBytes - a.sizeBytes), [totals]);
  if (sorted.length === 0) {
    return (
      <p role="status" style={{ margin: 0, fontSize: 12 }}>
        {scanEmptyText('types', fileCount, inaccessibleDirectories)}
      </p>
    );
  }
  return (
    <div
      role="region"
      aria-label="Сводка по типам файлов"
      tabIndex={0}
      style={{ overflow: 'auto', maxHeight: 220 }}
    >
      <table className="sd-process-table" style={{ width: '100%' }}>
        <caption className="sd-sr-only">Занятое место по типам файлов</caption>
        <thead>
          <tr>
            <th scope="col">Тип</th>
            <th scope="col">Размер</th>
            <th scope="col">Доля</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((total) => (
            <tr key={total.category}>
              <td>{total.category}</td>
              <td className="sd-num">{formatBytes(total.sizeBytes)}</td>
              <td className="sd-num">{formatShare(total.sizeBytes, totalBytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TypeTotalsSummary;
