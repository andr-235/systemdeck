import { useEffect, useMemo, useState } from 'react';
import type { DirectoryNode } from '@shared/ipc';
import { MAX_TREEMAP_DEPTH, layoutTreemap } from '../treemap';
import { formatBytes } from '../format';

export const TREEMAP_VIEW_WIDTH = 600;
export const TREEMAP_VIEW_HEIGHT = 360;

type StorageTreemapProps = {
  tree: DirectoryNode;
};

/** Находит дочерний узел текущего уровня по пути листа. */
function findChildByPath(current: DirectoryNode, path: string): DirectoryNode | null {
  return current.children.find((child) => child.path === path) ?? null;
}

/** Детерминированный оттенок по ключу — цвет квадрата привязан к каталогу верхнего уровня. */
export function treemapHue(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 360;
  }
  return (hash + 360) % 360;
}

function tileFill(hue: number, inaccessible: boolean, isFiles: boolean): string {
  if (isFiles) return 'var(--sd-color-muted)';
  if (inaccessible) return '#cbd5e1';
  return `hsl(${hue} 55% 78%)`;
}

function tileStroke(hue: number, inaccessible: boolean, isFiles: boolean): string {
  if (isFiles) return 'var(--sd-color-border)';
  if (inaccessible) return '#64748b';
  return `hsl(${hue} 55% 38%)`;
}

/**
 * Treemap SVG с drill-down (issue #39): чистый Renderer, без внешних библиотек.
 * Клик по квадрату-каталогу проваливается в Directory Node из агрегированного
 * дерева, breadcrumb возвращает назад. Tooltip — «имя + размер» через <title>.
 * Inaccessible Directory помечается и не трактуется как «пусто».
 */
function StorageTreemap({ tree }: StorageTreemapProps): React.JSX.Element {
  const [trail, setTrail] = useState<DirectoryNode[]>([tree]);

  useEffect(() => {
    setTrail([tree]);
  }, [tree]);

  const current = useMemo(
    () => trail[trail.length - 1] as DirectoryNode,
    [trail]
  );

  const tiles = useMemo(
    () => layoutTreemap(current, TREEMAP_VIEW_WIDTH, TREEMAP_VIEW_HEIGHT),
    [current]
  );

  const canDrillDeeper = trail.length < MAX_TREEMAP_DEPTH;

  const drillInto = (path: string): void => {
    if (!canDrillDeeper) return;
    const child = findChildByPath(current, path);
    if (child) setTrail((prev) => [...prev, child]);
  };

  const jumpTo = (index: number): void => {
    setTrail((prev) => prev.slice(0, index + 1));
  };

  return (
    <div className="sd-treemap">
      <nav aria-label="Хлебные крошки каталога" className="sd-treemap-breadcrumb">
        <ol className="sd-treemap-crumbs">
          {trail.map((node, index) => {
            const isLast = index === trail.length - 1;
            const key = `${node.path}::${index}`;
            return (
              <li key={key} className="sd-treemap-crumb">
                {index > 0 && (
                  <span aria-hidden="true" className="sd-treemap-separator">
                    /
                  </span>
                )}
                {isLast ? (
                  <span aria-current="page" className="sd-treemap-crumb-current">
                    {node.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="sd-treemap-crumb-button"
                    onClick={() => jumpTo(index)}
                    title={node.path}
                  >
                    {node.name}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <p style={{ margin: 0, fontSize: 12 }} className="sd-num">
        {current.path} · {formatBytes(current.sizeBytes)} · Файлов: {current.fileCount}
        {current.inaccessible ? ' · Недоступен для чтения' : ''}
      </p>

      {current.inaccessible && (
        <p role="note" style={{ margin: 0, fontSize: 12 }}>
          Каталог недоступен — содержимое не собрано, это не «пусто».
        </p>
      )}

      {tiles.length === 0 ? (
        <p role="status" style={{ margin: 0, fontSize: 12 }}>
          {current.inaccessible
            ? 'Нет данных: каталог недоступен для чтения.'
            : 'Папка пуста или данные не собраны.'}
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${TREEMAP_VIEW_WIDTH} ${TREEMAP_VIEW_HEIGHT}`}
          className="sd-treemap-svg"
          role="group"
          aria-label={`Карта занятого места: ${current.name}`}
          data-testid="storage-treemap-svg"
        >
          {tiles.map((tile) => {
            const { leaf } = tile;
            const isFiles = !leaf.dir;
            const hue = treemapHue(leaf.path);
            const label = leaf.inaccessible ? `${leaf.label} 🔒` : leaf.label;
            const showLabel = tile.width > 44 && tile.height > 22;
            const showSize = tile.width > 60 && tile.height > 40;
            const clickable = leaf.dir && canDrillDeeper;

            const tileContent = (
              <>
                <title>{`${leaf.label} — ${formatBytes(leaf.sizeBytes)}`}</title>
                <rect
                  x={tile.x}
                  y={tile.y}
                  width={tile.width}
                  height={tile.height}
                  fill={tileFill(hue, leaf.inaccessible, isFiles)}
                  stroke={tileStroke(hue, leaf.inaccessible, isFiles)}
                  strokeWidth={leaf.inaccessible ? 2 : 1}
                  strokeDasharray={leaf.inaccessible ? '5 3' : undefined}
                  rx={2}
                />
                {showLabel && (
                  <text
                    x={tile.x + 4}
                    y={tile.y + 16}
                    fontSize={12}
                    fill="var(--sd-color-foreground)"
                    pointerEvents="none"
                  >
                    {label.length > 18 ? `${label.slice(0, 17)}…` : label}
                  </text>
                )}
                {showSize && (
                  <text
                    x={tile.x + 4}
                    y={tile.y + 32}
                    fontSize={11}
                    fill="var(--sd-color-foreground-dim)"
                    pointerEvents="none"
                  >
                    {formatBytes(leaf.sizeBytes)}
                  </text>
                )}
              </>
            );

            return clickable ? (
              <g
                key={leaf.id}
                role="button"
                tabIndex={0}
                aria-label={`${leaf.label}, ${formatBytes(leaf.sizeBytes)}`}
                className="sd-treemap-tile sd-treemap-tile-clickable"
                onClick={() => drillInto(leaf.path)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    drillInto(leaf.path);
                  }
                }}
              >
                {tileContent}
              </g>
            ) : (
              <g key={leaf.id} className="sd-treemap-tile">
                {tileContent}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export default StorageTreemap;
