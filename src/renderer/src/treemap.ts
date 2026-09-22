import type { DirectoryNode } from '@shared/ipc';

export const MAX_TREEMAP_LEAVES = 300;

export type TreemapLeaf = {
  id: string;
  label: string;
  path: string;
  sizeBytes: number;
  dir: boolean;
};

export type TreemapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TreemapNode = TreemapRect & { leaf: TreemapLeaf };

/** Превращает «фокусируемый» узел дерева в листья карты:
 *  каталоги (dir: true) + синтетический лист «Файлы» для файлов самого узла. */
export function buildDirLeaves(
  node: DirectoryNode,
  maxLeaves: number = MAX_TREEMAP_LEAVES
): TreemapLeaf[] {
  const leaves: TreemapLeaf[] = [];
  if (node.filesBytes > 0) {
    leaves.push({
      id: `${node.path}::files`,
      label: 'Файлы',
      path: node.path,
      sizeBytes: node.filesBytes,
      dir: false,
    });
  }
  for (const child of node.children) {
    if (child.sizeBytes <= 0) continue;
    leaves.push({
      id: child.path,
      label: child.name,
      path: child.path,
      sizeBytes: child.sizeBytes,
      dir: true,
    });
  }
  const sorted = leaves.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return sorted.slice(0, maxLeaves);
}

/**
 * Squarify (Bruls, Huizing, van Wijk): раскладка прямоугольников площадью,
 * пропорциональной values, в контейнер width×height. Нулевые значения отбрасываются
 * (листья с нулевым размером в buildDirLeaves не создаются, порядок сохраняется).
 */
export function squarifyRects(
  values: readonly number[],
  width: number,
  height: number
): TreemapRect[] {
  if (width <= 0 || height <= 0 || values.length === 0) return [];
  const total = values.reduce((acc, v) => acc + (v > 0 ? v : 0), 0);
  if (total <= 0) return [];
  const k = (width * height) / total;
  const weighted = values.filter((v) => v > 0).map((v) => v * k);
  const output: TreemapRect[] = [];
  let index = 0;
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;

  while (index < weighted.length && w > 0 && h > 0) {
    const sside = Math.min(w, h);
    const worst = (row: number[]): number => {
      const s = row.reduce((a, b) => a + b, 0);
      const rowMin = Math.min(...row);
      const rowMax = Math.max(...row);
      return Math.max((s * s) / (rowMin * rowMin * sside), (rowMax * rowMax * sside) / (s * s));
    };

    const row: number[] = [weighted[index] as number];
    index += 1;
    while (index < weighted.length) {
      const candidate = [...row, weighted[index] as number];
      if (worst(candidate) <= worst(row)) {
        row.push(weighted[index] as number);
        index += 1;
      } else {
        break;
      }
    }

    const s = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const rowHeight = s / w;
      let top = y;
      for (const v of row) {
        output.push({ x, y: top, width: w, height: (v / s) * rowHeight });
        top += (v / s) * rowHeight;
      }
      y += rowHeight;
      h -= rowHeight;
    } else {
      const rowWidth = s / h;
      let left = x;
      for (const v of row) {
        output.push({ x: left, y, width: (v / s) * rowWidth, height: h });
        left += (v / s) * rowWidth;
      }
      x += rowWidth;
      w -= rowWidth;
    }
  }
  return output;
}

/** Полная раскладка фокусируемого узла: листья + прямоугольники, сопоставленные с ними. */
export function layoutTreemap(
  node: DirectoryNode,
  width: number,
  height: number,
  maxLeaves: number = MAX_TREEMAP_LEAVES
): TreemapNode[] {
  const leaves = buildDirLeaves(node, maxLeaves);
  const rects = squarifyRects(
    leaves.map((leaf) => leaf.sizeBytes),
    width,
    height
  );
  return rects.map((rect, i) => ({ ...rect, leaf: leaves[i] as TreemapLeaf }));
}