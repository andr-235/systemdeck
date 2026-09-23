import { describe, expect, it } from 'vitest';
import { BoundedTopK } from './topK';

describe('BoundedTopK', () => {
  it('keeps at most limit items', () => {
    const topK = new BoundedTopK<string>(3);
    for (let i = 1; i <= 10; i++) {
      topK.add(i, `item-${i}`);
    }
    expect(topK.size).toBe(3);
    expect(topK.snapshot()).toEqual(['item-10', 'item-9', 'item-8']);
  });

  it('returns items descriptor by value, largest first', () => {
    const topK = new BoundedTopK<string>(5);
    topK.add(2, 'b');
    topK.add(9, 'i');
    topK.add(5, 'e');
    expect(topK.snapshot()).toEqual(['i', 'e', 'b']);
  });

  it('returns empty snapshot when nothing added', () => {
    expect(new BoundedTopK<string>(3).snapshot()).toEqual([]);
  });

  it('evicts the smallest side first, staying bounded with duplicate values', () => {
    const topK = new BoundedTopK<string>(2);
    topK.add(1, 'first');
    topK.add(1, 'second');
    topK.add(2, 'bigger');
    topK.add(1, 'third');
    const result = topK.snapshot();
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('bigger');
    expect(result[1] === 'second' || result[1] === 'first').toBe(true);
  });

  it('handles zero and negative values', () => {
    const topK = new BoundedTopK<string>(2);
    topK.add(0, 'zero');
    topK.add(-5, 'below');
    topK.add(0, 'zero-b');
    expect([...topK.snapshot()].sort()).toEqual(['zero', 'zero-b']);
  });

  it('rejects a non-positive limit', () => {
    expect(() => new BoundedTopK<string>(0)).toThrow();
  });
});