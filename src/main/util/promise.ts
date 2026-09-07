/**
 * Выполняет асинхронную операцию и при ошибке возвращает готовый fallback.
 * Общий паттерн мониторов: сбой источника метрик не роняет такт — секция
 * просто получает пустое значение (Unavailable, ADR 0009).
 */
export async function withFallback<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await op();
  } catch {
    return fallback;
  }
}
