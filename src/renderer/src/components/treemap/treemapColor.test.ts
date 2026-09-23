import { describe, it, expect } from 'vitest';
import { tileFill, tileStroke, treemapHue } from './treemapColor';

describe('Renderer — treemapColor', () => {
  it('возвращает детерминированный оттенок в диапазоне 0–359', () => {
    expect(treemapHue('C:\\Windows')).toBe(treemapHue('C:\\Windows'));
    const hue = treemapHue('C:\\Windows');
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });

  it('различает файлы, недоступные и обычные каталоги', () => {
    expect(tileFill(120, false, true)).toBe('var(--sd-color-muted)');
    expect(tileFill(120, true, false)).toBe('#cbd5e1');
    expect(tileFill(120, false, false)).toBe('hsl(120 55% 78%)');
    expect(tileStroke(120, false, true)).toBe('var(--sd-color-border)');
    expect(tileStroke(120, true, false)).toBe('#64748b');
    expect(tileStroke(120, false, false)).toBe('hsl(120 55% 38%)');
  });
});
