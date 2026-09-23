import { describe, it, expect } from 'vitest';
import { buildDirLeaves, layoutTreemap, squarifyRects, MAX_TREEMAP_LEAVES } from './treemap';
import type { DirectoryNode } from '@shared/ipc';

function makeNode(overrides: Partial<DirectoryNode> = {}): DirectoryNode {
  return {
    name: 'C:',
    path: 'C:',
    sizeBytes: 0,
    filesBytes: 0,
    fileCount: 0,
    inaccessible: false,
    children: [],
    ...overrides,
  };
}

describe('Renderer — treemap buildDirLeaves', () => {
  it('adds a synthetic non-dir leaf sized to the node own files', () => {
    const node = makeNode({ filesBytes: 120 });
    const leaves = buildDirLeaves(node);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({
      id: 'C:::files',
      label: 'Файлы',
      path: 'C:',
      sizeBytes: 120,
      dir: false,
    });
  });

  it('emits child directories sorted by sizeBytes desc as clickable leaves', () => {
    const node = makeNode({
      filesBytes: 10,
      children: [
        makeNode({
          name: 'b',
          path: 'C:\\b',
          sizeBytes: 30,
          children: [],
        }),
        makeNode({ name: 'a', path: 'C:\\a', sizeBytes: 100, children: [] }),
      ],
    });
    const leaves = buildDirLeaves(node);
    expect(leaves.map((l) => l.label)).toEqual(['a', 'b', 'Файлы']);
    expect(leaves[0]).toMatchObject({ path: 'C:\\a', sizeBytes: 100, dir: true });
  });

  it('skips zero-sized children and caps the leaf count', () => {
    const children = Array.from({ length: MAX_TREEMAP_LEAVES + 5 }, (_, i) =>
      makeNode({
        name: `d${i}`,
        path: `C:\\d${i}`,
        sizeBytes: i === 0 ? 0 : i,
        children: [],
      })
    );
    const leaves = buildDirLeaves(makeNode({ children }));
    expect(leaves).toHaveLength(MAX_TREEMAP_LEAVES);
    expect(leaves.some((l) => l.sizeBytes === 0)).toBe(false);
  });

  it('keeps inaccessible zero-sized children as non-empty markers', () => {
    const node = makeNode({
      children: [
        makeNode({ name: 'locked', path: 'C:\\locked', sizeBytes: 0, inaccessible: true }),
      ],
    });
    const leaves = buildDirLeaves(node);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({ label: 'locked', dir: true, inaccessible: true });
  });

  it('marks the synthetic files leaf as accessible', () => {
    const leaves = buildDirLeaves(makeNode({ filesBytes: 10 }));
    expect(leaves[0]).toMatchObject({ dir: false, inaccessible: false });
  });
});

describe('Renderer — treemap squarifyRects', () => {
  it('tiles four equal values into equal-area slots of a square container', () => {
    const rects = squarifyRects([1, 1, 1, 1], 4, 4);
    expect(rects).toHaveLength(4);
    for (const rect of rects) {
      expect(rect.width * rect.height).toBeCloseTo(4);
    }
    const area = rects.reduce((acc, r) => acc + r.width * r.height, 0);
    expect(area).toBeCloseTo(16);
    expect(rects.every((r) => r.x >= 0 && r.y >= 0)).toBe(true);
    const bottom = Math.max(...rects.map((r) => r.y + r.height));
    const right = Math.max(...rects.map((r) => r.x + r.width));
    expect(bottom).toBeCloseTo(4);
    expect(right).toBeCloseTo(4);
  });

  it('produces areas proportional to values and fills the container', () => {
    const values = [6, 3, 1];
    const width = 10;
    const height = 6;
    const rects = squarifyRects(values, width, height);
    expect(rects).toHaveLength(3);
    const total = values.reduce((a, b) => a + b, 0);
    const area = rects.reduce((acc, r) => acc + r.width * r.height, 0);
    expect(area).toBeCloseTo(width * height);
    for (let i = 0; i < rects.length; i += 1) {
      expect(rects[i]!.width * rects[i]!.height).toBeCloseTo(
        (values[i]! / total) * width * height
      );
    }
  });

  it('returns empty for empty or all-zero input', () => {
    expect(squarifyRects([], 4, 4)).toEqual([]);
    expect(squarifyRects([0, 0], 4, 4)).toEqual([]);
  });

  it('drops zero values while keeping order of the positive ones', () => {
    const rects = squarifyRects([0, 2, 0, 4, 1], 3, 4);
    expect(rects).toHaveLength(3);
    const big = squarifyRects([2, 4, 1], 3, 4);
    expect(rects).toEqual(big);
  });
});

describe('Renderer — treemap layoutTreemap', () => {
  it('pairs each rect with its leaf and fills the whole area', () => {
    const node = makeNode({
      sizeBytes: 60,
      filesBytes: 20,
      children: [
        makeNode({ name: 'a', path: 'C:\\a', sizeBytes: 40, children: [] }),
      ],
    });
    const tiles = layoutTreemap(node, 10, 6);
    expect(tiles).toHaveLength(2);
    expect(tiles.map((t) => t.leaf.label)).toEqual(['a', 'Файлы']);
    const area = tiles.reduce((acc, t) => acc + t.width * t.height, 0);
    expect(area).toBeCloseTo(60);
  });
});