import { execFile, type ExecFileOptions } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const WMI_TIMEOUT_MS = 5000;

/**
 * Выполняет PowerShell-команду с CIM/WMI-запросом и возвращает сырой stdout.
 * Приложение не elevated — все источники подобраны под чтение без прав администратора.
 */
export async function runPowershell(
  command: string,
  options: ExecFileOptions = { timeout: WMI_TIMEOUT_MS, windowsHide: true }
): Promise<string> {
  if (process.platform !== 'win32') {
    // Не-Windows окружение (тесты, dev на другом хосте) — нет WMI, честный отказ.
    throw new Error('WMI/CIM доступен только на Windows');
  }
  const { stdout: rawStdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    options
  );
  return String(rawStdout);
}

/**
 * Выполняет powershell-скрипт, ожидающий JSON через ConvertTo-Json, и парсит его.
 */
export async function runPowershellJson<T>(command: string): Promise<T> {
  const stdout = await runPowershell(command);
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('PowerShell вернул пустой вывод');
  }
  return JSON.parse(trimmed) as T;
}
