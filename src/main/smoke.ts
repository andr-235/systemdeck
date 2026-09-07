import type { BrowserWindow } from 'electron';
import { toErrorParts } from '@shared/ipc/errors';
import { SHARED_CONTRACT_VERSION } from '@shared/api';
import { SMOKE_VERDICT, formatSmokeLine } from '@shared/smoke';
import { getLogger } from './logger';

/**
 * Smoke-проба реального Electron рантайма: ждёт полную загрузку окна и проверяет,
 * что preload выставил window.api, Application API отвечает (system:info),
 * а внутренний health-чек ping сверяется с контрактом.
 * Результат печатается в stdout строкой формата `SMOKE: ok|fail <detail>`
 * (единый источник формата — @shared/smoke, consumer — scripts/smoke-electron.mjs).
 */
const SMOKE_PROBE = `(async () => {
  const api = (window).api;
  if (!api || typeof api.ping !== 'function' || typeof api.system?.getInfo !== 'function') {
    return { hasApi: false, pingOk: false, systemOk: false };
  }
  const [system, ping] = await Promise.all([
    api.system.getInfo(),
    api.ping({ version: '${SHARED_CONTRACT_VERSION}' }),
  ]);
  return {
    hasApi: true,
    pingOk: ping?.ok === true && ping?.data?.matched === true,
    systemOk: system?.ok === true,
  };
})()`;

type SmokeProbeResult = {
  hasApi: boolean;
  pingOk: boolean;
  systemOk: boolean;
};

export function runSmokeProbe(window: BrowserWindow): Promise<boolean> {
  const logger = getLogger('smoke');
  // stdout — контракт с scripts/smoke-electron.mjs; console запрещён (no-console)
  const report = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };
  return new Promise((resolve) => {
    window.webContents.once('did-finish-load', () => {
      void (async () => {
        try {
          const result = (await window.webContents.executeJavaScript(
            SMOKE_PROBE
          )) as SmokeProbeResult;
          const ok = result.hasApi === true && result.pingOk === true && result.systemOk === true;
          logger.info('smoke probe result', result);
          report(
            formatSmokeLine(ok ? SMOKE_VERDICT.ok : SMOKE_VERDICT.fail, JSON.stringify(result))
          );
          resolve(ok);
        } catch (error) {
          logger.error('smoke probe error', toErrorParts(error));
          report(formatSmokeLine(SMOKE_VERDICT.fail, `probe-error ${toErrorParts(error).message}`));
          resolve(false);
        }
      })();
    });
  });
}
