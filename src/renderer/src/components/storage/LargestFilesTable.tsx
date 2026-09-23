import type { LargestFileEntry } from '@shared/ipc';
import { formatBytes } from '../../format';
import { scanEmptyText } from './scanEmptyText';

const MAX_LARGEST_FILES = 100;

type LargestFilesTableProps = {
  files: LargestFileEntry[];
  fileCount: number;
  inaccessibleDirectories: number;
};

function LargestFilesTable({
  files,
  fileCount,
  inaccessibleDirectories,
}: LargestFilesTableProps): React.JSX.Element {
  if (files.length === 0) {
    return (
      <p role="status" style={{ margin: 0, fontSize: 12 }}>
        {scanEmptyText('files', fileCount, inaccessibleDirectories)}
      </p>
    );
  }
  const visible = files.slice(0, MAX_LARGEST_FILES);
  return (
    <div
      role="region"
      aria-label="Крупнейшие файлы"
      tabIndex={0}
      style={{ overflow: 'auto', maxHeight: 260 }}
    >
      <table className="sd-process-table" style={{ width: '100%' }}>
        <caption className="sd-sr-only">Крупнейшие файлы тома (до 100)</caption>
        <thead>
          <tr>
            <th scope="col">Путь</th>
            <th scope="col">Размер</th>
            <th scope="col">Тип</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((file) => (
            <tr key={file.path}>
              <td title={file.path} style={{ wordBreak: 'break-all' }}>
                <div>{file.name}</div>
                <div style={{ opacity: 0.6, fontSize: 11 }}>{file.path}</div>
              </td>
              <td className="sd-num">{formatBytes(file.sizeBytes)}</td>
              <td>{file.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LargestFilesTable;
