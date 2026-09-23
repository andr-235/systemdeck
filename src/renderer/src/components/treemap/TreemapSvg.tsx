import { useMemo } from 'react';
import type { DirectoryNode } from '@shared/ipc';
import { layoutTreemap } from '../../treemap';
import TreemapTile from './TreemapTile';

export const TREEMAP_VIEW_WIDTH = 600;
export const TREEMAP_VIEW_HEIGHT = 360;

/** Зазор между плитками — карта читается как сетка, а не сплошное пятно. */
const TILE_GAP = 1;

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
      {tiles.map((tile) => {
        const inset =
          tile.width > TILE_GAP * 2 && tile.height > TILE_GAP * 2
            ? {
                ...tile,
                x: tile.x + TILE_GAP,
                y: tile.y + TILE_GAP,
                width: tile.width - TILE_GAP * 2,
                height: tile.height - TILE_GAP * 2,
              }
            : tile;
        return (
          <TreemapTile
            key={tile.leaf.id}
            tile={inset}
            totalBytes={current.sizeBytes}
            clickable={tile.leaf.dir && canDrillDeeper}
            onDrill={onDrill}
          />
        );
      })}
    </svg>
  );
}

export default TreemapSvg;
