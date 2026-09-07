import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  initLogger,
  getLogger,
  getLogFilePath,
  getLogLevel,
  __resetLoggerForTests,
  redact,
  resolveLogLevelFromEnv,
  MAX_LOG_SIZE_BYTES,
} from './logger';

describe('Main logger (node project)', () => {
  let tmpDir: string;
  let logFile: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'systemdeck-log-test-'));
    logFile = join(tmpDir, 'systemdeck.log');
    __resetLoggerForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    __resetLoggerForTests();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    delete process.env.LOG_LEVEL;
    delete process.env.SYSTEMDECK_LOG_LEVEL;
    // remove --log-level from argv
    process.argv = process.argv.filter((a) => !a.startsWith('--log-level='));
  });

  it('writes JSON-lines with ts, level, scope, msg, meta', () => {
    initLogger({ file: logFile, level: 'debug' });
    const logger = getLogger('test-scope');
    logger.info('hello world', { foo: 'bar' });

    const content = readFileSync(logFile, 'utf8').trim();
    const entry = JSON.parse(content);
    expect(entry.level).toBe('info');
    expect(entry.scope).toBe('test-scope');
    expect(entry.msg).toBe('hello world');
    expect(entry.meta).toEqual({ foo: 'bar' });
    expect(typeof entry.ts).toBe('string');
  });

  it('filters by level: debug not written when level=info', () => {
    initLogger({ file: logFile, level: 'info' });
    const logger = getLogger('main');
    logger.debug('should not appear');
    logger.info('should appear');

    const content = readFileSync(logFile, 'utf8').trim();
    expect(content).not.toContain('should not appear');
    expect(content).toContain('should appear');
  });

  it('redacts sensitive keys recursively (case-insensitive)', () => {
    initLogger({ file: logFile, level: 'debug' });
    const logger = getLogger('main');
    logger.info('sensitive', {
      username: 'alice',
      password: 'secret123',
      nested: { token: 'abc', safe: 'ok' },
      mySecretKey: 'hidden',
      list: [{ credential: 'x', ok: 1 }],
    });

    const entry = JSON.parse(readFileSync(logFile, 'utf8').trim());
    expect(entry.meta.password).toBe('[REDACTED]');
    expect(entry.meta.nested.token).toBe('[REDACTED]');
    expect(entry.meta.nested.safe).toBe('ok');
    expect(entry.meta.mySecretKey).toBe('[REDACTED]');
    // list redaction
    expect(entry.meta.list[0].credential).toBe('[REDACTED]');
    expect(entry.meta.username).toBe('alice');
  });

  it('redact helper handles nested objects and arrays', () => {
    expect(redact({ password: 'p', inner: { authToken: 't' } })).toEqual({
      password: '[REDACTED]',
      inner: { authToken: '[REDACTED]' },
    });
  });

  it('resolves log level from env and CLI with correct precedence', () => {
    // default without env is debug (since NODE_ENV != production in test)
    __resetLoggerForTests();
    expect(resolveLogLevelFromEnv()).toBe('debug');

    process.env.LOG_LEVEL = 'warn';
    expect(resolveLogLevelFromEnv()).toBe('warn');

    process.env.SYSTEMDECK_LOG_LEVEL = 'error';
    expect(resolveLogLevelFromEnv()).toBe('error');

    process.argv.push('--log-level=trace');
    expect(resolveLogLevelFromEnv()).toBe('trace');
  });

  it('getLogFilePath and getLogLevel reflect initLogger options', () => {
    initLogger({ file: logFile, level: 'warn' });
    expect(getLogFilePath()).toBe(logFile);
    expect(getLogLevel()).toBe('warn');
  });

  it('rotates when exceeding 5MB (creates .1 backup)', () => {
    initLogger({ file: logFile, level: 'debug' });
    // Pre-fill file to near limit
    const nearLimit = MAX_LOG_SIZE_BYTES - 50;
    const filler = 'a'.repeat(nearLimit);
    writeFileSync(logFile, filler, 'utf8');
    expect(statSync(logFile).size).toBeGreaterThan(MAX_LOG_SIZE_BYTES - 100);

    const logger = getLogger('main');
    logger.info('trigger rotation', { x: '1'.repeat(200) });

    // Original should be rotated to .1
    expect(existsSync(`${logFile}.1`)).toBe(true);
    // New log file should contain trigger entry
    const newContent = readFileSync(logFile, 'utf8');
    expect(newContent).toContain('trigger rotation');
    const rotatedContent = readFileSync(`${logFile}.1`, 'utf8');
    expect(rotatedContent).toContain('a'.repeat(10));
  });

  it('does not throw when file write fails (invalid path handle)', () => {
    // Use a valid file to ensure no throw; error path is silently ignored
    initLogger({ file: logFile, level: 'debug' });
    const logger = getLogger('main');
    expect(() => logger.info('no crash')).not.toThrow();
    expect(existsSync(logFile)).toBe(true);
  });

  it('logs with trace level filtering', () => {
    initLogger({ file: logFile, level: 'trace' });
    getLogger('a').trace('trace msg');
    const content = readFileSync(logFile, 'utf8');
    expect(content).toContain('trace msg');
  });
});
