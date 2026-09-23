import { useMemo } from 'react';
import type { DirectoryNode } from '@shared/ipc';
import { layoutTreemap } from '../../treemap';
import { TREEMAP_VIEW_HEIGHT, TREEMAP_VIEW_WIDTH } from './TreemapSvg';
import { formatBytes } from '../../format';
import { useTreemapTrail } from './useTreemapTrail';
import TreemapBreadcrumb from './TreemapBreadcrumb';
import TreemapSvg from './TreemapSvg';

type StorageTreemapProps = {
  tree: DirectoryNode;
};

function StorageTreemap({ tree }: StorageTreemapProps): React.JSX.Element {
  const { trail, current, canDrillDeeper, drillInto, jumpTo } = useTreemapTrail(tree);
  const isEmpty = useMemo(
    () => layoutTreemap(current, TREEMAP_VIEW_WIDTH, TREEMAP_VIEW_HEIGHT).length === 0,
    [current]
  );
  return (
    <div className="sd-treemap">
      <TreemapBreadcrumb trail={trail} onJump={jumpTo} />
      <p style={{ margin: 0, fontSize: 12 }} className="sd-num">
        {current.path} · {formatBytes(current.sizeBytes)} · Файлов: {current.fileCount}
        {current.inaccessible ? ' · Недоступен для чтения' : ''}
      </p>
      {current.inaccessible && (
        <p role="note" style={{ margin: 0, fontSize: 12 }}>
          Каталог недоступен — содержимое не собрано, это не «пусто».
        </p>
      )}
      {isEmpty ? (
        <p role="status" style={{ margin: 0, fontSize: 12 }}>
          {current.inaccessible
            ? 'Нет данных: каталог недоступен для чтения.'
            : 'Папка пуста или данные не собраны.'}
        </p>
      ) : (
        <TreemapSvg current={current} canDrillDeeper={canDrillDeeper} onDrill={drillInto} />
      )}
    </div>
  );
}

export default StorageTreemap;
