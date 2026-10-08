import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Enforces the 80-code-line limit on Renderer .tsx component files (AGENTS.md,
// "Автоматические гейты"). Existing offenders are frozen at their current size
// in file-size-baseline.json: they may shrink but never grow, and every new
// file must fit the limit.
const ROOT = join(import.meta.dirname, '..');
const RENDERER_SRC = join(ROOT, 'src', 'renderer', 'src');
const LIMIT = 80;
const BASELINE_PATH = join(import.meta.dirname, 'file-size-baseline.json');

function collectTsx(dir) {
  let out = [];
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...collectTsx(p));
    else if (p.endsWith('.tsx') && !p.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

function countCodeLines(file) {
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return text.split('\n').filter((l) => l.trim() && !/^\s*\/\//.test(l)).length;
}

function fail(msg) {
  console.error(`[check:file-size] ${msg}`);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
let errors = 0;
const seen = new Set();

for (const file of collectTsx(RENDERER_SRC)) {
  const rel = relative(RENDERER_SRC, file).replaceAll('\\', '/');
  seen.add(rel);
  const lines = countCodeLines(file);
  const allowance = baseline[rel] ?? LIMIT;
  if (lines > allowance) {
    const hint =
      rel in baseline
        ? `baseline ${allowance}, grew to ${lines} — split the file, or raise the baseline only after explicit review`
        : `limit is ${LIMIT} code lines — split into hooks/components`;
    fail(`${rel}: ${lines} code lines (${hint})`);
    errors++;
  }
}

for (const rel of Object.keys(baseline)) {
  if (!seen.has(rel)) {
    fail(`${rel}: stale baseline entry — file is gone, remove it`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`[check:file-size] FAILED with ${errors} violation(s)`);
  process.exit(1);
} else {
  console.log('[check:file-size] OK — all Renderer .tsx within limit/baseline');
}
