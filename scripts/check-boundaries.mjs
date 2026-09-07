import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

function collectFiles(dir, exts = ['.ts', '.tsx', '.js', '.mjs', '.cjs']) {
  let out = []
  let entries = []
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...collectFiles(p, exts))
    else if (exts.some((ext) => p.endsWith(ext))) out.push(p)
  }
  return out
}

function fail(msg) {
  console.error(`[check:boundaries] ${msg}`)
}

let errors = 0

// 1. Renderer must not import Privileged API / cross-layer modules
const rendererFiles = collectFiles(join(ROOT, 'src/renderer'))
const forbiddenRenderer = [
  /from\s+['"]electron['"]/g,
  /require\s*\(\s*['"]electron['"]/g,
  /from\s+['"]node:[^'"]+['"]/g,
  /require\s*\(\s*['"]node:[^'"]+['"]/g,
  /\bimport\s+.*\bfrom\s+['"]\.\.?\/.*(main|preload)[^'"]*['"]/g,
  /from\s+['"]@electron-toolkit\/[^'"]+['"]/g,
]

for (const f of rendererFiles) {
  const text = readFileSync(f, 'utf8')
  for (const re of forbiddenRenderer) {
    re.lastIndex = 0
    if (re.test(text)) {
      fail(`${f}: forbidden import matches ${re} (Renderer -/-> Privileged/Main/Preload)`)
      errors++
    }
  }
  // direct relative escape: renderer -> src/main or src/preload
  if (text.includes('src/main') || text.includes('src/preload')) {
    // allow comment lines that mention the path in docs, but fail if it's an import
    if (/import\s+.*src\/(main|preload)/.test(text)) {
      fail(`${f}: Renderer must not import from src/main or src/preload`)
      errors++
    }
  }
}

// 2. Shared must not import runtime Electron/Node
const sharedFiles = collectFiles(join(ROOT, 'src/shared'))
const forbiddenShared = [
  /from\s+['"]electron['"]/g,
  /require\s*\(\s*['"]electron['"]/g,
  /from\s+['"]node:[^'"]+['"]/g,
  /require\s*\(\s*['"]node:[^'"]+['"]/g,
  /from\s+['"]@electron-toolkit\/[^'"]+['"]/g,
]

for (const f of sharedFiles) {
  const text = readFileSync(f, 'utf8')
  for (const re of forbiddenShared) {
    re.lastIndex = 0
    if (re.test(text)) {
      fail(`${f}: Shared must not import runtime Electron/Node (${re})`)
      errors++
    }
  }
}

// 3. Preload must be the only place using contextBridge
const preloadBridge = collectFiles(join(ROOT, 'src/preload')).length
  ? collectFiles(join(ROOT, 'src/preload')).some((f) => readFileSync(f, 'utf8').includes('contextBridge'))
  : false
if (!preloadBridge) {
  fail('Preload must expose window.api via contextBridge (src/preload/index.ts)')
  errors++
}

// Scan non-preload layers for accidental contextBridge usage
for (const layer of ['src/main', 'src/renderer', 'src/shared']) {
  for (const f of collectFiles(join(ROOT, layer))) {
    if (readFileSync(f, 'utf8').includes('contextBridge')) {
      fail(`${f}: contextBridge is allowed only in src/preload`)
      errors++
    }
  }
}

if (errors > 0) {
  console.error(`[check:boundaries] FAILED with ${errors} violation(s)`)
  process.exit(1)
} else {
  console.log('[check:boundaries] OK — allowed dependency directions respected')
}
