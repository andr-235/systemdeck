import { describe, it, expect } from 'vitest';
import { tileFill, tileStroke } from './treemapColor';

describe('Renderer — treemapColor', () => {
  it('различает файлы, недоступные и обычные каталоги', () => {
    expect(tileFill(0.5, false, true)).toBe('hsl(217 30% 90%)');
    expect(tileFill(0.5, true, false)).toBe('#cbd5e1');
    expect(tileStroke(0.5, false, true)).toBe('hsl(217 25% 68%)');
    expect(tileStroke(0.5, true, false)).toBe('#64748b');
  });

  it('большая доля — темнее (монохромная шкала)', () => {
    const small = tileFill(0.05, false, false);
    const big = tileFill(0.9, false, false);
    expect(small).toBe('hsl(217 60% 83%)');
    expect(big).toBe('hsl(217 60% 61%)');
  });

  it('невалидная доля не ломает шкалу', () => {
    expect(tileFill(Number.NaN, false, false)).toBe(tileFill(0, false, false));
    expect(tileFill(99, false, false)).toBe(tileFill(1, false, false));
  });
});
