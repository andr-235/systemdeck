import type { TreemapNode } from '../../treemap';
import { formatBytes } from '../../format';
import { tileColors } from './treemapColor';

const MIN_LABEL_WIDTH = 44;
const MIN_LABEL_HEIGHT = 22;
const MIN_SIZE_WIDTH = 60;
const MIN_SIZE_HEIGHT = 40;
const TILE_RADIUS = 3;
const LOCKED_STROKE_WIDTH = 2;
const LOCKED_DASH = '5 3';
const MAX_LABEL_CHARS = 18;
const TEXT_OFFSET_X = 4;
const LABEL_OFFSET_Y = 16;
const SIZE_OFFSET_Y = 32;

type TreemapTileProps = {
  tile: TreemapNode;
  totalBytes: number;
  clickable: boolean;
  onDrill: (path: string) => void;
};

function TreemapTile({ tile, totalBytes, clickable, onDrill }: TreemapTileProps): React.JSX.Element {
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
      {showLabel && (
        <text x={tile.x + TEXT_OFFSET_X} y={tile.y + LABEL_OFFSET_Y} fontSize={12} fill="var(--sd-color-foreground)" pointerEvents="none">
          {leaf.label.length > MAX_LABEL_CHARS ? `${leaf.label.slice(0, MAX_LABEL_CHARS - 1)}…` : leaf.label}
        </text>
      )}
      {showSize && (
        <text x={tile.x + TEXT_OFFSET_X} y={tile.y + SIZE_OFFSET_Y} fontSize={11} fill="var(--sd-color-foreground-dim)" pointerEvents="none">
          {formatBytes(leaf.sizeBytes)}
        </text>
      )}
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
