import { useId, useState } from 'react';
import type { ScanResult } from '@shared/ipc';
import LargestFilesTable from './LargestFilesTable';
import TypeTotalsSummary from './TypeTotalsSummary';
import StorageTablist from './StorageTablist';
import type { SidebarTab } from './StorageTablist';

type StorageSidebarProps = { result: ScanResult };

function StorageSidebar({ result }: StorageSidebarProps): React.JSX.Element {
  const [active, setActive] = useState<SidebarTab>('files');
  const baseId = useId();
  return (
    <>
      <h3 style={{ margin: 0, fontSize: 13 }}>Крупнейшие файлы и типы</h3>
      {result.inaccessibleDirectories > 0 && (
        <p role="note" style={{ margin: 0, fontSize: 12 }}>
          Данные могут быть неполными: недоступно каталогов: {result.inaccessibleDirectories}.
        </p>
      )}
      <StorageTablist active={active} baseId={baseId} onSelect={setActive} />
      <div
        role="tabpanel"
        id={`${baseId}-files-panel`}
        aria-labelledby={`${baseId}-files`}
        hidden={active !== 'files'}
      >
        <LargestFilesTable
          files={result.largestFiles}
          fileCount={result.fileCount}
          inaccessibleDirectories={result.inaccessibleDirectories}
        />
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-types-panel`}
        aria-labelledby={`${baseId}-types`}
        hidden={active !== 'types'}
      >
        <TypeTotalsSummary
          totals={result.typeTotals}
          totalBytes={result.totalBytes}
          fileCount={result.fileCount}
          inaccessibleDirectories={result.inaccessibleDirectories}
        />
      </div>
    </>
  );
}

export default StorageSidebar;
