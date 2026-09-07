/**
 * Исполнение терминации процесса в Main (ADR 0011): Stop-Process -Force.
 * Защищённые процессы не завершаются — проверка имени в классификации Main;
 * Renderer дополнительно блокирует кнопку по флагу `protected`.
 */
export async function terminateProcess(pid: number): Promise<void> {
  const { runPowershell } = await import('./ps');
  await runPowershell(`Stop-Process -Id ${pid} -Force -ErrorAction Stop`);
}

/**
 * Возвращает имя процесса по PID (через Win32_Process). null — процесс не найден.
 */
export async function resolveProcessName(pid: number): Promise<string | null> {
  const { runPowershellJson } = await import('./ps');
  const rows = await runPowershellJson<Array<{ Name: string | null }>>(
    `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object Name | ConvertTo-Json -Compress`
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.Name ?? null;
}
