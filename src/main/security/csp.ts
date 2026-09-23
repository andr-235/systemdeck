/**
 * Content-Security-Policy для Main.
 * Dev-исключение: Vite dev-сервер и HMR (@vitejs/plugin-react) требуют
 * инлайн-преамбулы, несовместимой с `script-src 'self'`, поэтому в dev
 * заголовок не ставится (доверенный локальный loopback). Прод не ослабляется.
 */

export const CSP_HEADER_NAME = 'Content-Security-Policy' as const;

export const CSP_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; connect-src 'self' ws: wss:" as const;

export function resolveCspHeaders(isDev: boolean): Record<string, string[]> | null {
  if (isDev) return null;
  return { [CSP_HEADER_NAME]: [CSP_POLICY] };
}
