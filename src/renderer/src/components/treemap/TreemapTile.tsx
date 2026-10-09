import type { TreemapNode } from '../../treemap';
import { formatBytes } from '../../format';
import { tileColors } from './treemapColor';
import TreemapTileLabels from './TreemapTileLabels';

const MIN_LABEL_WIDTH = 44;
const MIN_LABEL_HEIGHT = 22;
const MIN_SIZE_WIDTH = 60;
const MIN_SIZE_HEIGHT = 40;
const TILE_RADIUS = 3;
const LOCKED_STROKE_WIDTH = 2;
const LOCKED_DASH = '5 3';

type TreemapTileProps = {
  tile: TreemapNode;
  totalBytes: number;
  clickable: boolean;
  onDrill: (path: string) => void;
};

function TreemapTile({
  tile,
  totalBytes,
  clickable,
  onDrill,
}: TreemapTileProps): React.JSX.Element {
  const { leaf } = tile;
  const isFiles = !leaf.dir;
  const share = totalBytes > 0 ? leaf.sizeBytes / totalBytes : 0;
  const colors = tileColors(leaf.path, share, leaf.inaccessible, isFiles);
  const showLabel = tile.width > MIN_LABEL_WIDTH && tile.height > MIN_LABEL_HEIGHT;
  const showSize = tile.width > MIN_SIZE_WIDTH && tile.height > MIN_SIZE_HEIGHT;
  const content = (
    <>
      <title>{`${leaf.label} — ${formatBytes(leaf.sizeBytes)}`}</title>
      <rect
        x={tile.x}
        y={tile.y}
        width={tile.width}
        height={tile.height}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={leaf.inaccessible ? LOCKED_STROKE_WIDTH : 1}
        strokeDasharray={leaf.inaccessible ? LOCKED_DASH : undefined}
        rx={TILE_RADIUS}
      />
      <TreemapTileLabels tile={tile} showLabel={showLabel} showSize={showSize} />
    </>
  );
  if (!clickable) {
    return <g className="sd-treemap-tile">{content}</g>;
  }
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${leaf.label}, ${formatBytes(leaf.sizeBytes)}`}
      className="sd-treemap-tile sd-treemap-tile-clickable"
      onClick={() => onDrill(leaf.path)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onDrill(leaf.path);
        }
      }}
    >
      {content}
    </g>
  );
}

export default TreemapTile;
