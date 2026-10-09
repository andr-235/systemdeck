import type { TreemapNode } from '../../treemap';
import { formatBytes } from '../../format';

const MAX_LABEL_CHARS = 18;
const TEXT_OFFSET_X = 4;
const LABEL_OFFSET_Y = 16;
const SIZE_OFFSET_Y = 32;

type TreemapTileLabelsProps = {
  tile: TreemapNode;
  showLabel: boolean;
  showSize: boolean;
};

function TreemapTileLabels({
  tile,
  showLabel,
  showSize,
}: TreemapTileLabelsProps): React.JSX.Element {
  const { leaf } = tile;
  return (
    <>
      {showLabel && (
        <text
          x={tile.x + TEXT_OFFSET_X}
          y={tile.y + LABEL_OFFSET_Y}
          fontSize={12}
          fill="var(--sd-color-foreground)"
          pointerEvents="none"
        >
          {leaf.label.length > MAX_LABEL_CHARS
            ? `${leaf.label.slice(0, MAX_LABEL_CHARS - 1)}…`
            : leaf.label}
        </text>
      )}
      {showSize && (
        <text
          x={tile.x + TEXT_OFFSET_X}
          y={tile.y + SIZE_OFFSET_Y}
          fontSize={11}
          fill="var(--sd-color-foreground-dim)"
          pointerEvents="none"
        >
          {formatBytes(leaf.sizeBytes)}
        </text>
      )}
    </>
  );
}

export default TreemapTileLabels;
