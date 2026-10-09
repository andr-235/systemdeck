import { getLogFilePath } from '../logger';
import { isPathUnderRoot, normalizeCleanerPath } from './paths';
import { windowsDir } from './systemRoots';

/** Явный deny-список системных корней: deny побеждает allow (REQ-004). */
export function cleanerDenyRoots(): string[] {
  const win = windowsDir();
  return [`${win}\\System32`, `${win}\\SysWOW64`, `${win}\\WinSxS`, `${win}\\Boot`];
}

/** Активный Application Log под защитой: его удаление ломает учёт ротации (issue #57). */
function isActiveApplicationLog(path: string): boolean {
  const logFile = getLogFilePath();
  return logFile !== null && normalizeCleanerPath(path) === normalizeCleanerPath(logFile);
}

export function isProtectedPath(path: string): boolean {
  if (isActiveApplicationLog(path)) {
    return true;
  }
  return cleanerDenyRoots().some((root) => isPathUnderRoot(path, root));
}
