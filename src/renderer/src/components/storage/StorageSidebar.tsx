import { useId, useRef, useState } from 'react';
import type { ScanResult } from '@shared/ipc';
import LargestFilesTable from './LargestFilesTable';
import TypeTotalsSummary from './TypeTotalsSummary';

type StorageSidebarProps = { result: ScanResult };
const TAB_IDS = ['files', 'types'] as const;
type SidebarTab = (typeof TAB_IDS)[number];
const TAB_LABELS: Record<SidebarTab, string> = { files: 'Файлы', types: 'По типам' };

function StorageSidebar({ result }: StorageSidebarProps): React.JSX.Element {
  const [active, setActive] = useState<SidebarTab>('files');
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectTab = (index: number): void => {
    setActive(TAB_IDS[index] as SidebarTab);
    tabRefs.current[index]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const at = TAB_IDS.indexOf(active);
    if (e.key === 'ArrowRight') selectTab((at + 1) % TAB_IDS.length);
    else if (e.key === 'ArrowLeft') selectTab((at - 1 + TAB_IDS.length) % TAB_IDS.length);
    else if (e.key === 'Home') selectTab(0);
    else if (e.key === 'End') selectTab(TAB_IDS.length - 1);
  };
  return (
    <>
      <h3 style={{ margin: 0, fontSize: 13 }}>Крупнейшие файлы и типы</h3>
      {result.inaccessibleDirectories > 0 && (
        <p role="note" style={{ margin: 0, fontSize: 12 }}>
          Данные могут быть неполными: недоступно каталогов: {result.inaccessibleDirectories}.
        </p>
      )}
      <div role="tablist" aria-label="Детали хранилища" className="sd-tablist" onKeyDown={onKeyDown}>
        {TAB_IDS.map((id, index) => (
          <button key={id} type="button" role="tab" id={`${baseId}-${id}`}
            aria-selected={active === id} aria-controls={`${baseId}-${id}-panel`}
            tabIndex={active === id ? 0 : -1} className="sd-tab" onClick={() => setActive(id)}
            ref={(el) => { tabRefs.current[index] = el; }}>
            {TAB_LABELS[id]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-files-panel`} aria-labelledby={`${baseId}-files`} hidden={active !== 'files'}>
        <LargestFilesTable files={result.largestFiles} fileCount={result.fileCount}
          inaccessibleDirectories={result.inaccessibleDirectories} />
      </div>
      <div role="tabpanel" id={`${baseId}-types-panel`} aria-labelledby={`${baseId}-types`} hidden={active !== 'types'}>
        <TypeTotalsSummary totals={result.typeTotals} totalBytes={result.totalBytes}
          fileCount={result.fileCount} inaccessibleDirectories={result.inaccessibleDirectories} />
      </div>
    </>
  );
}

export default StorageSidebar;
