import type { TreemapNode } from '../../treemap';
import { formatBytes } from '../../format';
import { tileFill, tileStroke } from './treemapColor';

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
  const showLabel = tile.width > 44 && tile.height > 22;
  const showSize = tile.width > 60 && tile.height > 40;
  const content = (
    <>
      <title>{`${leaf.label} — ${formatBytes(leaf.sizeBytes)}`}</title>
      <rect
        x={tile.x}
        y={tile.y}
        width={tile.width}
        height={tile.height}
        fill={tileFill(share, leaf.inaccessible, isFiles)}
        stroke={tileStroke(share, leaf.inaccessible, isFiles)}
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
