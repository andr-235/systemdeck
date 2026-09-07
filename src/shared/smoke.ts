/**
 * Smoke-протокол: единый источник формата строки результата.
 * Emitter — Main (src/main/smoke.ts), consumer — scripts/smoke-electron.mjs.
 * Менять формат нужно здесь, а не в двух местах с литералами.
 */
export const SMOKE_LINE_PREFIX = 'SMOKE:';

export const SMOKE_VERDICT = {
  ok: 'ok',
  fail: 'fail',
} as const;

export type SmokeVerdict = (typeof SMOKE_VERDICT)[keyof typeof SMOKE_VERDICT];

export function formatSmokeLine(verdict: SmokeVerdict, detail: string): string {
  return `${SMOKE_LINE_PREFIX} ${verdict} ${detail}`;
}
