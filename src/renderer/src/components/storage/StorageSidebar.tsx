import type { ScanResult } from '@shared/ipc';
import LargestFilesTable from './LargestFilesTable';
import TypeTotalsSummary from './TypeTotalsSummary';

type StorageSidebarProps = {
  result: ScanResult;
};

function StorageSidebar({ result }: StorageSidebarProps): React.JSX.Element {
  return (
    <>
      <h3 style={{ margin: 0, fontSize: 13 }}>Крупнейшие файлы и типы</h3>
      <LargestFilesTable
        files={result.largestFiles}
        fileCount={result.fileCount}
        inaccessibleDirectories={result.inaccessibleDirectories}
      />
      <TypeTotalsSummary
        totals={result.typeTotals}
        totalBytes={result.totalBytes}
        fileCount={result.fileCount}
        inaccessibleDirectories={result.inaccessibleDirectories}
      />
    </>
  );
}

export default StorageSidebar;
