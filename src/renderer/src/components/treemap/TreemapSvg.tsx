import { useMemo } from 'react';
import type { DirectoryNode } from '@shared/ipc';
import { layoutTreemap } from '../../treemap';
import TreemapTile from './TreemapTile';

export const TREEMAP_VIEW_WIDTH = 600;
export const TREEMAP_VIEW_HEIGHT = 360;

type TreemapSvgProps = {
  current: DirectoryNode;
  canDrillDeeper: boolean;
  onDrill: (path: string) => void;
};

function TreemapSvg({ current, canDrillDeeper, onDrill }: TreemapSvgProps): React.JSX.Element {
  const tiles = useMemo(
    () => layoutTreemap(current, TREEMAP_VIEW_WIDTH, TREEMAP_VIEW_HEIGHT),
    [current]
  );
  return (
    <svg
      viewBox={`0 0 ${TREEMAP_VIEW_WIDTH} ${TREEMAP_VIEW_HEIGHT}`}
      className="sd-treemap-svg"
      role="group"
      aria-label={`Карта занятого места: ${current.name}`}
      data-testid="storage-treemap-svg"
    >
      {tiles.map((tile) => (
        <TreemapTile
          key={tile.leaf.id}
          tile={tile}
          clickable={tile.leaf.dir && canDrillDeeper}
          onDrill={onDrill}
        />
      ))}
    </svg>
  );
}

export default TreemapSvg;
