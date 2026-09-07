/**
 * Защищённость процессов: классификация — источник правды в Main (ADR 0011).
 * Используется и монитором (флаг `protected` в контракте), и терминатором
 * (отказ завершать защищённые). Renderer лишь читает флаг и никогда не
 * классифицирует сам.
 */
const PROTECTED_PROCESS_NAMES = new Set<string>([
  'System Idle Process',
  'System',
  'Registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'winlogon.exe',
  'services.exe',
  'lsass.exe',
  'lsm.exe',
  'svchost.exe',
  'dwm.exe',
]);

export function classifyProtectedProcessName(name: string | null): boolean {
  return name !== null && name !== '' && PROTECTED_PROCESS_NAMES.has(name);
}
