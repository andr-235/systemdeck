import type { TreemapNode } from '../../treemap';
import { formatBytes } from '../../format';
import { tileColors } from './treemapColor';

const MIN_LABEL_WIDTH = 44;
const MIN_LABEL_HEIGHT = 22;
const MIN_SIZE_WIDTH = 60;
const MIN_SIZE_HEIGHT = 40;

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
  const showSize = tile.width > MIN_SIZE_WIDTH && tile.height > MIN_SIZE_HEIGHT;  const content = (
    <>
      <title>{`${leaf.label} — ${formatBytes(leaf.sizeBytes)}`}</title>
      <rect
        x={tile.x}
        y={tile.y}
        width={tile.width}
        height={tile.height}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={leaf.inaccessible ? 2 : 1}
        strokeDasharray={leaf.inaccessible ? '5 3' : undefined}
        rx={3}
      />
      {showLabel && (
        <text x={tile.x + 4} y={tile.y + 16} fontSize={12} fill="var(--sd-color-foreground)" pointerEvents="none">
          {leaf.label.length > 18 ? `${leaf.label.slice(0, 17)}…` : leaf.label}
        </text>
      )}
      {showSize && (
        <text x={tile.x + 4} y={tile.y + 32} fontSize={11} fill="var(--sd-color-foreground-dim)" pointerEvents="none">
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
