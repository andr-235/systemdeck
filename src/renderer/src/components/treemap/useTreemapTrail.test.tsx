import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DirectoryNode } from '@shared/ipc';
import { useTreemapTrail } from './useTreemapTrail';

function makeNode(overrides: Partial<DirectoryNode> = {}): DirectoryNode {
  return {
    name: 'C:',
    path: 'C:',
    sizeBytes: 300,
    filesBytes: 100,
    fileCount: 2,
    inaccessible: false,
    children: [],
    ...overrides,
  };
}

const child = makeNode({ name: 'Win', path: 'C:\\Win', sizeBytes: 200, filesBytes: 200 });
const tree = makeNode({ children: [child] });

describe('Renderer — useTreemapTrail', () => {
  it('проваливается в дочерний узел и возвращается через jumpTo', () => {
    const { result } = renderHook(() => useTreemapTrail(tree));
    expect(result.current.current.path).toBe('C:');
    act(() => result.current.drillInto('C:\\Win'));
    expect(result.current.current.path).toBe('C:\\Win');
    expect(result.current.trail).toHaveLength(2);
    act(() => result.current.jumpTo(0));
    expect(result.current.current.path).toBe('C:');
  });

  it('игнорирует неизвестный путь', () => {
    const { result } = renderHook(() => useTreemapTrail(tree));
    act(() => result.current.drillInto('C:\\Nope'));
    expect(result.current.trail).toHaveLength(1);
  });

  it('сбрасывает trail при смене дерева', () => {
    const { result, rerender } = renderHook(({ t }: { t: DirectoryNode }) => useTreemapTrail(t), {
      initialProps: { t: tree },
    });
    act(() => result.current.drillInto('C:\\Win'));
    expect(result.current.trail).toHaveLength(2);
    rerender({ t: makeNode({ name: 'D:', path: 'D:' }) });
    expect(result.current.trail).toHaveLength(1);
    expect(result.current.current.path).toBe('D:');
  });
});
