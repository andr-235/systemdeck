import { isPathUnderRoot } from './paths';
import { windowsDir } from './systemRoots';

/** Явный deny-список системных корней: deny побеждает allow (REQ-004). */
export function cleanerDenyRoots(): string[] {
  const win = windowsDir();
  return [`${win}\\System32`, `${win}\\SysWOW64`, `${win}\\WinSxS`, `${win}\\Boot`];
}

export function isProtectedPath(path: string): boolean {
  return cleanerDenyRoots().some((root) => isPathUnderRoot(path, root));
}
