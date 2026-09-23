/** Одноцветная шкала treemap (hue 217 — семейство --sd-color-secondary):
 * чем больше доля узла, тем темнее плитка. Спокойнее радуги по хешу пути. */

const FOCUS_HUE = 217;

function clampShare(share: number): number {
  if (!Number.isFinite(share)) return 0;
  return Math.min(1, Math.max(0, share));
}

export function tileFill(share: number, inaccessible: boolean, isFiles: boolean): string {
  if (isFiles) return `hsl(${FOCUS_HUE} 30% 90%)`;
  if (inaccessible) return '#cbd5e1';
  const lightness = Math.round(84 - 26 * clampShare(share));
  return `hsl(${FOCUS_HUE} 60% ${lightness}%)`;
}

export function tileStroke(share: number, inaccessible: boolean, isFiles: boolean): string {
  if (isFiles) return `hsl(${FOCUS_HUE} 25% 68%)`;
  if (inaccessible) return '#64748b';
  const lightness = Math.round(52 - 14 * clampShare(share));
  return `hsl(${FOCUS_HUE} 55% ${lightness}%)`;
}
