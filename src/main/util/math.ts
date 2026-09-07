export function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function percentFrom(total: number, part: number): number {
  if (total <= 0) return 0;
  return roundToTenth((part / total) * 100);
}

/** Число, если это конечное неотрицательное значение; иначе null (Unavailable). */
export function finiteNonNeg(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Строка с непустым содержимым (trim); пустые/отсутствующие значения → null. */
export function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
