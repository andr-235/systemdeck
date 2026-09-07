/* eslint-disable no-console */
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

export const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_LOG_FILES = 3;

const SENSITIVE_KEY_RE = /(password|token|secret|key|auth|credential)/i;

let currentLevel: LogLevel = resolveDefaultLevel();
let currentFile: string | null = null;
let initialized = false;

function resolveDefaultLevel(): LogLevel {
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function normalizeLevel(value: string | undefined): LogLevel | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  if (v === 'trace' || v === 'debug' || v === 'info' || v === 'warn' || v === 'error') {
    return v;
  }
  return null;
}

export function resolveLogLevelFromEnv(): LogLevel {
  const cliArg = process.argv.find((a) => a.startsWith('--log-level='));
  if (cliArg) {
    const v = normalizeLevel(cliArg.split('=')[1]);
    if (v) return v;
  }
  const envSystem = normalizeLevel(process.env.SYSTEMDECK_LOG_LEVEL);
  if (envSystem) return envSystem;
  const envLog = normalizeLevel(process.env.LOG_LEVEL);
  if (envLog) return envLog;
  return resolveDefaultLevel();
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[currentLevel];
}

export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redact(v));
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: String(value.message),
      stack: value.stack ? String(value.stack) : undefined,
    };
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return String(value);
}

function ensureDirForFile(file: string): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
  } catch {
    // ignore
  }
}

function rotateIfNeeded(file: string, nextEntrySize: number): void {
  try {
    if (!existsSync(file)) return;
    const stat = statSync(file);
    if (stat.size + nextEntrySize <= MAX_LOG_SIZE_BYTES) return;

    const oldest = `${file}.${MAX_LOG_FILES}`;
    if (existsSync(oldest)) {
      try {
        unlinkSync(oldest);
      } catch {
        // ignore
      }
    }
    for (let i = MAX_LOG_FILES - 1; i >= 1; i -= 1) {
      const src = `${file}.${i}`;
      const dest = `${file}.${i + 1}`;
      if (existsSync(src)) {
        try {
          renameSync(src, dest);
        } catch {
          // ignore
        }
      }
    }
    try {
      renameSync(file, `${file}.1`);
    } catch {
      // ignore
    }
  } catch {
    // ignore rotation errors
  }
}

function writeLog(level: LogLevel, scope: string, message: string, meta?: unknown): void {
  if (!shouldLog(level)) return;

  const redactedMeta = meta !== undefined ? redact(meta) : undefined;
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg: message,
    ...(redactedMeta !== undefined ? { meta: redactedMeta } : {}),
  };
  const line = JSON.stringify(entry);

  if (currentFile) {
    try {
      ensureDirForFile(currentFile);
      const lineWithNl = line + '\n';
      rotateIfNeeded(currentFile, Buffer.byteLength(lineWithNl, 'utf8'));
      appendFileSync(currentFile, lineWithNl, 'utf8');
    } catch {
      // file logging must not crash main
    }
  }

  const pretty = `[${entry.ts}] ${level.toUpperCase()} [${scope}] ${message}${redactedMeta !== undefined ? ` ${JSON.stringify(redactedMeta)}` : ''}`;
  switch (level) {
    case 'trace':
    case 'debug':
      console.debug(pretty);
      break;
    case 'info':
      console.info(pretty);
      break;
    case 'warn':
      console.warn(pretty);
      break;
    case 'error':
      console.error(pretty);
      break;
  }
}

export interface Logger {
  trace: (msg: string, meta?: unknown) => void;
  debug: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

export function getLogger(scope: string): Logger {
  return {
    trace: (msg, meta) => writeLog('trace', scope, msg, meta),
    debug: (msg, meta) => writeLog('debug', scope, msg, meta),
    info: (msg, meta) => writeLog('info', scope, msg, meta),
    warn: (msg, meta) => writeLog('warn', scope, msg, meta),
    error: (msg, meta) => writeLog('error', scope, msg, meta),
  };
}

export function initLogger(options?: { file?: string | null; level?: LogLevel }): void {
  if (options?.level) {
    currentLevel = options.level;
  } else if (!initialized) {
    currentLevel = resolveLogLevelFromEnv();
  }

  if (options?.file !== undefined) {
    currentFile = options.file;
  } else if (!initialized) {
    try {
      // Lazy import to avoid hard dep in tests / non-electron env
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require('electron') as { app?: { getPath: (n: string) => string } };
      if (electron?.app?.getPath) {
        const userData = electron.app.getPath('userData');
        currentFile = join(userData, 'logs', 'systemdeck.log');
      }
    } catch {
      currentFile = null;
    }
  }

  if (currentFile) {
    ensureDirForFile(currentFile);
  }

  initialized = true;
}

export function getLogFilePath(): string | null {
  return currentFile;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

/** @internal — только для тестов */
export function __resetLoggerForTests(): void {
  currentLevel = resolveDefaultLevel();
  currentFile = null;
  initialized = false;
}

/** @internal — только для тестов, возвращает порядок уровней */
export function __getLogLevelOrderForTests(): Record<LogLevel, number> {
  return { ...LOG_LEVEL_ORDER };
}
