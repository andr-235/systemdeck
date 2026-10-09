/** Снимок переменных окружения: в тестах передаётся объект вместо process.env. */
export type Env = Record<string, string | undefined>;

/**
 * Абсолютный каталог из переменной окружения. Пустое, относительное, с `.`/`..`-сегментами
 * или равное корню диска значение считается повреждённым и не используется (issue #56).
 */
export function envDir(env: Env, name: string): string | null {
  const raw = env[name];
  if (typeof raw !== 'string') {
    return null;
  }
  const normalized = raw
    .trim()
    .replace(/\//g, '\\')
    .replace(/[\s\\]+$/, '');
  if (!/^[A-Za-z]:\\/.test(normalized)) {
    return null;
  }
  const segments = normalized.split('\\');
  return segments.includes('.') || segments.includes('..') ? null : normalized;
}

/** Системный каталог Windows: %WINDIR%, затем %SystemRoot%; null — переменная сломана. */
export function systemRootDir(env: Env = process.env): string | null {
  return envDir(env, 'WINDIR') ?? envDir(env, 'SystemRoot');
}

/** Системный каталог для deny-списка: сломанная переменная не оставляет список пустым. */
export function windowsDir(env: Env = process.env): string {
  return systemRootDir(env) ?? 'C:\\Windows';
}

/** %LOCALAPPDATA%: null — допустимая область TEMP неизвестна, allow-корни не строятся. */
export function localAppDataDir(env: Env = process.env): string | null {
  return envDir(env, 'LOCALAPPDATA');
}
