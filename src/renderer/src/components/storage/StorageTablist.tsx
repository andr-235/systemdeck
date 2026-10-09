import { useRef } from 'react';

const TAB_IDS = ['files', 'types'] as const;
export type SidebarTab = (typeof TAB_IDS)[number];
const TAB_LABELS: Record<SidebarTab, string> = { files: 'Файлы', types: 'По типам' };

type StorageTablistProps = {
  active: SidebarTab;
  baseId: string;
  onSelect: (tab: SidebarTab) => void;
};

function StorageTablist({ active, baseId, onSelect }: StorageTablistProps): React.JSX.Element {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusTab = (index: number): void => {
    const tab = TAB_IDS[index];
    if (tab === undefined) return;
    onSelect(tab);
    tabRefs.current[index]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const at = TAB_IDS.indexOf(active);
    if (e.key === 'ArrowRight') focusTab((at + 1) % TAB_IDS.length);
    else if (e.key === 'ArrowLeft') focusTab((at - 1 + TAB_IDS.length) % TAB_IDS.length);
    else if (e.key === 'Home') focusTab(0);
    else if (e.key === 'End') focusTab(TAB_IDS.length - 1);
  };
  return (
    <div role="tablist" aria-label="Детали хранилища" className="sd-tablist" onKeyDown={onKeyDown}>
      {TAB_IDS.map((id, index) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`${baseId}-${id}`}
          aria-selected={active === id}
          aria-controls={`${baseId}-${id}-panel`}
          tabIndex={active === id ? 0 : -1}
          className="sd-tab"
          onClick={() => onSelect(id)}
          ref={(el) => {
            tabRefs.current[index] = el;
          }}
        >
          {TAB_LABELS[id]}
        </button>
      ))}
    </div>
  );
}

export default StorageTablist;
