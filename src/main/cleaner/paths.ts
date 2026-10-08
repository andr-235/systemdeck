/** Нормализация Windows-путей для движка Cleaner: слэши, регистр, хвост. */
export function normalizeCleanerPath(path: string): string {
  const backslashed = path.replace(/\//g, '\\');
  const trimmed = backslashed.replace(/\\+$/, '');
  return trimmed.toLowerCase();
}

/** Путь находится строго под корнем (граница сегмента, не префикс строки). */
export function isPathUnderRoot(path: string, root: string): boolean {
  const file = normalizeCleanerPath(path);
  const base = normalizeCleanerPath(root);
  if (file === base) {
    return true;
  }
  return file.startsWith(`${base}\\`);
}
