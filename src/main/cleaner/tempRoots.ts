import { dedupeRoots, isPathStrictlyUnderRoot, normalizeCleanerPath } from './paths';
import { envDir, localAppDataDir, systemRootDir, type Env } from './systemRoots';

/** Базовый подтверждённый корень пользователя: стандартный %LOCALAPPDATA%\Temp. */
export function userTempBase(env: Env = process.env): string | null {
  const local = localAppDataDir(env);
  return local ? `${local}\\Temp` : null;
}

function acceptedTempVar(value: string, base: string): boolean {
  // Разрешённая область — только подтверждённый базовый корень: вне его переменная не действует.
  return (
    normalizeCleanerPath(value) === normalizeCleanerPath(base) ||
    isPathStrictlyUnderRoot(value, base)
  );
}

/**
 * Подтверждённые allow-корни user-temp: базовый корень плюс допустимые %TEMP%/%TMP%;
 * совпадающие и вложенные корни дедуплицируются (issue #56).
 */
export function userTempRoots(env: Env = process.env): string[] {
  const base = userTempBase(env);
  if (base === null) {
    return [];
  }
  const roots = [base];
  for (const name of ['TEMP', 'TMP']) {
    const value = envDir(env, name);
    if (value !== null && acceptedTempVar(value, base)) {
      roots.push(value);
    }
  }
  return dedupeRoots(roots);
}

/** Allow-корень windows-temp из %WINDIR%; null — переменная пуста или повреждена. */
export function windowsTempRoot(env: Env = process.env): string | null {
  const win = systemRootDir(env);
  return win ? `${win}\\Temp` : null;
}
