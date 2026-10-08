/** Системные корни из окружения: deny-список не привязан к букве диска. */
export function windowsDir(): string {
  return process.env.SystemRoot ?? 'C:\\Windows';
}

export function localAppData(): string {
  return process.env.LOCALAPPDATA ?? 'C:\\Users\\Default\\AppData\\Local';
}
