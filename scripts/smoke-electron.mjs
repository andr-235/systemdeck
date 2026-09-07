/**
 * Real-Electron smoke test: launches the built app and verifies the preload bridge.
 *
 * Uses SYSTEMDECK_SMOKE=1: the main process (src/main/index.ts) runs a probe after
 * did-finish-load and prints `SMOKE: ok|fail <json>`; exits 0/1 accordingly.
 * Run after `npm run build` (electron app entry: out/main/index.js).
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const root = join(import.meta.dirname, '..');
const entry = join(root, 'out', 'main', 'index.js');

if (typeof electronPath !== 'string') {
  console.error('SMOKE: fail — electron binary not resolvable');
  process.exit(1);
}

const child = spawn(electronPath, [entry], {
  env: { ...process.env, SYSTEMDECK_SMOKE: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk;
});
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

const TIMEOUT_MS = 60000;
const timer = setTimeout(() => {
  console.error('SMOKE: fail — timeout waiting for the app');
  child.kill();
  process.exit(1);
}, TIMEOUT_MS);

child.on('close', (code) => {
  clearTimeout(timer);
  if (stderr.trim()) process.stderr.write(stderr);
  if (stdout.trim()) process.stdout.write(stdout);
  // Формат сторки эмиттится в src/shared/smoke.ts (formatSmokeLine) — здесь только generic-матчер.
  const verdict = stdout.match(/SMOKE:\s*(ok|fail)\b/)?.[1];
  const ok = verdict === 'ok';
  const fail = verdict === 'fail';
  if (code === 0 && ok && !fail) {
    console.log('SMOKE: PASS');
    process.exit(0);
  }
  console.error(`\nSMOKE: FAIL (exit=${code}, ok=${ok}, fail=${fail})`);
  process.exit(1);
});
