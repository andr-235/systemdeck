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

let currentLevel: LogLevel = resolveDefaultLevel();
let currentFile: string | null = null;
let currentFileSize: number | null = null;
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

/**
 * Приоритет: CLI --log-level > SYSTEMDECK_LOG_LEVEL > LOG_LEVEL > дефолт (debug/info).
 * Переопределение без пересборки — AC SD-005.
 */
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

function isSensitiveKey(key: string): boolean {
  const tokens = key.split(/(?<=[a-z])(?=[A-Z])|[_-]/);
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === 'key') return true;
    if (['password', 'token', 'secret', 'auth', 'credential', 'credentials'].includes(lower))
      return true;
    // Для составных токенов типа "credentials" уже покрыто, для "userPassword" token "Password" → lower "password" → match
    if (lower.includes('password') || lower.includes('token') || lower.includes('secret'))
      return true;
    if (lower.includes('credential')) return true;
    if (lower === 'auth') return true;
  }
  // Fallback для ключей без camelCase разбиения, где token не выделился (напр. "mySecretKey" уже разбит)
  // Проверяем ключевые подстроки, но избегаем "monkey"/"donkey"/"turkey"
  const lowerKey = key.toLowerCase();
  if (
    ['password', 'token', 'secret', 'credential', 'credentials'].some((w) => lowerKey.includes(w))
  )
    return true;
  if (lowerKey.includes('auth') && !lowerKey.includes('author')) return true;
  return false;
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
      if (isSensitiveKey(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return String(value);
}

function safeFs(fn: () => void): void {
  try {
    fn();
  } catch {
    // ignore — логирование не должно ронять Main
  }
}

function ensureDirForFile(file: string): void {
  safeFs(() => mkdirSync(dirname(file), { recursive: true }));
}

function cachedFileSize(file: string): number {
  if (currentFileSize === null) {
    if (!existsSync(file)) return 0;
    currentFileSize = statSync(file).size;
  }
  return currentFileSize;
}

function rotateIfNeeded(file: string, nextEntrySize: number): void {
  try {
    if (cachedFileSize(file) + nextEntrySize <= MAX_LOG_SIZE_BYTES) return;

    const oldest = `${file}.${MAX_LOG_FILES}`;
    if (existsSync(oldest)) safeFs(() => unlinkSync(oldest));

    for (let i = MAX_LOG_FILES - 1; i >= 1; i -= 1) {
      const src = `${file}.${i}`;
      const dest = `${file}.${i + 1}`;
      if (existsSync(src)) safeFs(() => renameSync(src, dest));
    }
    safeFs(() => renameSync(file, `${file}.1`));
    currentFileSize = 0;
  } catch {
    // ignore rotation errors
    currentFileSize = null;
  }
}

const CONSOLE_BY_LEVEL: Record<LogLevel, (...args: unknown[]) => void> = {
  trace: console.debug.bind(console),
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

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
      const entryBytes = Buffer.byteLength(lineWithNl, 'utf8');
      rotateIfNeeded(currentFile, entryBytes);
      appendFileSync(currentFile, lineWithNl, 'utf8');
      currentFileSize = (currentFileSize ?? 0) + entryBytes;
    } catch {
      // file logging must not crash main
      currentFileSize = null;
    }
  }

  const pretty = `[${entry.ts}] ${level.toUpperCase()} [${scope}] ${message}${redactedMeta !== undefined ? ` ${JSON.stringify(redactedMeta)}` : ''}`;
  CONSOLE_BY_LEVEL[level](pretty);
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

function resolveFileFromApp(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { app?: { getPath: (n: string) => string } };
    if (electron?.app?.getPath) {
      const userData = electron.app.getPath('userData');
      return join(userData, 'logs', 'systemdeck.log');
    }
  } catch {
    // ignore — electron не доступен (тесты) или app не готов
  }
  return null;
}

export function initLogger(options?: { file?: string | null; level?: LogLevel }): void {
  if (options?.level) {
    currentLevel = options.level;
  } else if (!initialized) {
    currentLevel = resolveLogLevelFromEnv();
  }

  if (options?.file !== undefined) {
    currentFile = options.file;
    currentFileSize = null;
  } else if (!initialized || currentFile === null) {
    const resolved = resolveFileFromApp();
    if (resolved) {
      currentFile = resolved;
      currentFileSize = null;
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
  currentFileSize = null;
  initialized = false;
}
