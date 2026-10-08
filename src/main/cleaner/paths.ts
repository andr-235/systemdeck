/** Нормализация Windows-путей для движка Cleaner: слэши, регистр, хвост. */
export function normalizeCleanerPath(path: string): string {
  const backslashed = path.replace(/\//g, '\\');
  const trimmed = backslashed.replace(/\\+$/, '');
  return trimmed.toLowerCase();
}

/** Путь строго под корнем (сам корень не считается): allow-правила и guard удаления. */
export function isPathStrictlyUnderRoot(path: string, root: string): boolean {
  const file = normalizeCleanerPath(path);
  const base = normalizeCleanerPath(root);
  return file.startsWith(`${base}\\`);
}

/** Путь под корнем или равен ему (граница сегмента, не префикс строки). */
export function isPathUnderRoot(path: string, root: string): boolean {
  if (normalizeCleanerPath(path) === normalizeCleanerPath(root)) {
    return true;
  }
  return isPathStrictlyUnderRoot(path, root);
}
