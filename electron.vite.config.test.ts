import { describe, expect, it } from 'vitest';
import config from './electron.vite.config';

// Регрессия: без явного host Vite резолвит 'localhost' в ::1 (dns-порядок verbatim
// в Node ≥17) и Electron получает ERR_CONNECTION_REFUSED на 127.0.0.1.
describe('electron.vite.config', () => {
  it('dev-сервер рендерера слушает только IPv4-loopback 127.0.0.1', () => {
    expect(config.renderer?.server?.host).toBe('127.0.0.1');
  });
});
