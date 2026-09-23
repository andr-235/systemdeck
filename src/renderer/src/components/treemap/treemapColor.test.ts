import { describe, it, expect } from 'vitest';
import { tileFill, tileStroke, treemapPaletteIndex } from './treemapColor';

describe('Renderer — treemapColor', () => {
  it('один путь всегда даёт один цвет', () => {
    expect(treemapPaletteIndex('C:\\Windows')).toBe(treemapPaletteIndex('C:\\Windows'));
    expect(tileFill('C:\\Windows', 0.2, false, false)).toBe(
      tileFill('C:\\Windows', 0.2, false, false)
    );
  });

  it('различает файлы, недоступные и обычные каталоги', () => {
    expect(tileFill('k', 0.5, false, true)).toBe('hsl(217 28% 88%)');
    expect(tileFill('k', 0.5, true, false)).toBe('#cbd5e1');
    expect(tileStroke('k', 0.5, false, true)).toBe('hsl(217 25% 65%)');
    expect(tileStroke('k', 0.5, true, false)).toBe('#64748b');
  });

  it('разные пути могут дать разные цвета, доля затемняет', () => {
    const fills = new Set(
      ['C:\\Windows', 'C:\\Games', 'C:\\Data', 'C:\\Tools'].map((p) =>
        tileFill(p, 0, false, false)
      )
    );
    expect(fills.size).toBeGreaterThan(1);
    expect(tileFill('C:\\Windows', 0.9, false, false)).not.toBe(
      tileFill('C:\\Windows', 0.05, false, false)
    );
  });

  it('невалидная доля не ломает шкалу', () => {
    expect(tileFill('k', Number.NaN, false, false)).toBe(tileFill('k', 0, false, false));
    expect(tileFill('k', 99, false, false)).toBe(tileFill('k', 1, false, false));
  });
});
