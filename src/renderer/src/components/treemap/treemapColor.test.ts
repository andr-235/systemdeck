import { describe, it, expect } from 'vitest';
import { tileColors, treemapPaletteIndex } from './treemapColor';

describe('Renderer — treemapColor', () => {
  it('один путь всегда даёт один цвет', () => {
    expect(treemapPaletteIndex('C:\\Windows')).toBe(treemapPaletteIndex('C:\\Windows'));
    expect(tileColors('C:\\Windows', 0.2, false, false)).toEqual(
      tileColors('C:\\Windows', 0.2, false, false)
    );
  });

  it('различает файлы, недоступные и обычные каталоги', () => {
    expect(tileColors('k', 0.5, false, true)).toEqual({
      fill: 'hsl(217 28% 88%)',
      stroke: 'hsl(217 25% 65%)',
    });
    expect(tileColors('k', 0.5, true, false)).toEqual({ fill: '#cbd5e1', stroke: '#64748b' });
  });

  it('разные пути могут дать разные заливки, доля затемняет', () => {
    const fills = new Set(
      ['C:\\Windows', 'C:\\Games', 'C:\\Data', 'C:\\Tools'].map(
        (p) => tileColors(p, 0, false, false).fill
      )
    );
    expect(fills.size).toBeGreaterThan(1);
    expect(tileColors('C:\\Windows', 0.9, false, false).fill).not.toBe(
      tileColors('C:\\Windows', 0.05, false, false).fill
    );
  });

  it('невалидная доля не ломает шкалу', () => {
    expect(tileColors('k', Number.NaN, false, false)).toEqual(tileColors('k', 0, false, false));
    expect(tileColors('k', 99, false, false)).toEqual(tileColors('k', 1, false, false));
  });
});
