/** Детерминированный оттенок по ключу — цвет квадрата привязан к каталогу. */
export function treemapHue(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 360;
  }
  return (hash + 360) % 360;
}

export function tileFill(hue: number, inaccessible: boolean, isFiles: boolean): string {
  if (isFiles) return 'var(--sd-color-muted)';
  if (inaccessible) return '#cbd5e1';
  return `hsl(${hue} 55% 78%)`;
}

export function tileStroke(hue: number, inaccessible: boolean, isFiles: boolean): string {
  if (isFiles) return 'var(--sd-color-border)';
  if (inaccessible) return '#64748b';
  return `hsl(${hue} 55% 38%)`;
}
