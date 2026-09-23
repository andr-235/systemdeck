/** Категориальная палитра treemap: каждая папка получает стабильный цвет
 * по хешу пути (тот же каталог — тот же цвет на любом уровне), доля размера
 * лишь затемняет плитку. Палитра приглушённая, без кричащих пастелей. */

type PaletteEntry = { hue: number; saturation: number; lightness: number };

const PALETTE: PaletteEntry[] = [
  { hue: 217, saturation: 62, lightness: 72 },
  { hue: 150, saturation: 52, lightness: 68 },
  { hue: 32, saturation: 78, lightness: 66 },
  { hue: 0, saturation: 62, lightness: 71 },
  { hue: 272, saturation: 50, lightness: 74 },
  { hue: 187, saturation: 55, lightness: 66 },
  { hue: 96, saturation: 48, lightness: 68 },
  { hue: 330, saturation: 58, lightness: 74 },
  { hue: 46, saturation: 82, lightness: 64 },
  { hue: 238, saturation: 52, lightness: 74 },
  { hue: 200, saturation: 68, lightness: 68 },
  { hue: 14, saturation: 66, lightness: 67 },
];

const FILES_FILL = 'hsl(217 28% 88%)';
const FILES_STROKE = 'hsl(217 25% 65%)';
const LOCKED_FILL = '#cbd5e1';
const LOCKED_STROKE = '#64748b';

function clampShare(share: number): number {
  if (!Number.isFinite(share)) return 0;
  return Math.min(1, Math.max(0, share));
}

/** Индекс цвета по ключу — детерминирован, один ключ всегда один цвет. */
export function treemapPaletteIndex(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % PALETTE.length;
  }
  return (hash + PALETTE.length) % PALETTE.length;
}

export function tileFill(key: string, share: number, inaccessible: boolean, isFiles: boolean): string {
  if (isFiles) return FILES_FILL;
  if (inaccessible) return LOCKED_FILL;
  const base = PALETTE[treemapPaletteIndex(key)] as PaletteEntry;
  const lightness = Math.round(base.lightness - 10 * clampShare(share));
  return `hsl(${base.hue} ${base.saturation}% ${lightness}%)`;
}

export function tileStroke(key: string, share: number, inaccessible: boolean, isFiles: boolean): string {
  if (isFiles) return FILES_STROKE;
  if (inaccessible) return LOCKED_STROKE;
  const base = PALETTE[treemapPaletteIndex(key)] as PaletteEntry;
  const lightness = Math.round(base.lightness - 34 - 6 * clampShare(share));
  return `hsl(${base.hue} ${base.saturation}% ${lightness}%)`;
}
