import { describe, expect, it } from 'vitest';
import type { BrowserDiscovery } from './browserRoots';
import {
  browserSourceStatus,
  buildPreviewSource,
  missingRootsReason,
  resolveSourceStatus,
} from './sourceStatus';
import { cleanerRules, TEMP_MIN_AGE_HOURS } from './rules';
import type { CollectResult } from './walker';

function collected(partial: Partial<CollectResult> = {}): CollectResult {
  return { entries: [], inaccessibleDirs: [], unavailableRoots: [], ...partial };
}

describe('cleanup source status', () => {
  it('reports unavailable with the environment reason when no roots are configured', () => {
    expect(resolveSourceStatus('windows-temp', 0, collected(), 0)).toEqual({
      status: 'unavailable',
      reason: missingRootsReason('windows-temp'),
    });
    expect(resolveSourceStatus('user-temp', 0, collected(), 0).reason).toContain('%LOCALAPPDATA%');
    expect(resolveSourceStatus('log-files', 0, collected(), 0).reason).toBe(
      'Каталог логов SystemDeck не определён: Application Log не инициализирован'
    );
  });

  it('explains an unreadable root by the missing admin rights', () => {
    const result = resolveSourceStatus(
      'windows-temp',
      1,
      collected({ unavailableRoots: [{ root: 'C:\\Windows\\Temp', code: 'EACCES' }] }),
      0
    );
    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('права администратора');
  });

  it('stays partial when only one of several roots is unreadable', () => {
    const result = resolveSourceStatus(
      'user-temp',
      2,
      collected({ unavailableRoots: [{ root: 'X:\\Temp', code: 'ENOENT' }] }),
      3
    );
    expect(result).toEqual({ status: 'partial', reason: 'Каталог не найден' });
  });

  it('marks nested inaccessible directories as partial with a reason', () => {
    const result = resolveSourceStatus(
      'user-temp',
      1,
      collected({ inaccessibleDirs: ['C:\\Temp\\locked'] }),
      0
    );
    expect(result.status).toBe('partial');
    expect(result.reason).toBeTruthy();
  });

  it('distinguishes an available source without candidates from an unavailable one', () => {
    expect(resolveSourceStatus('user-temp', 1, collected(), 0)).toEqual({ status: 'empty' });
    expect(resolveSourceStatus('user-temp', 1, collected(), 4)).toEqual({ status: 'ok' });
  });

  it('carries the age threshold from the rule configuration into the source', () => {
    const rules = cleanerRules();
    const source = buildPreviewSource({
      category: 'user-temp',
      rules,
      roots: ['C:\\Temp'],
      collected: collected(),
      candidates: [],
    });
    expect(source.minAgeHours).toBe(TEMP_MIN_AGE_HOURS);
    expect(source).toMatchObject({ status: 'empty', candidateCount: 0, estimatedBytes: 0 });
  });

  it('omits the age threshold for categories that do not configure it', () => {
    const source = buildPreviewSource({
      category: 'recycle-bin',
      rules: cleanerRules(),
      roots: ['C:\\$Recycle.Bin'],
      collected: collected(),
      candidates: [{ sizeBytes: 5 }],
    });
    expect(source.minAgeHours).toBeUndefined();
    expect(source).toMatchObject({ status: 'ok', candidateCount: 1, estimatedBytes: 5 });
  });
});

describe('browser-cache source status', () => {
  const discovery = (partial: Partial<BrowserDiscovery> = {}): BrowserDiscovery => ({
    roots: [],
    denied: [],
    envMissing: false,
    ...partial,
  });

  it('reports an absent browser or profile as empty, not unavailable', () => {
    expect(
      browserSourceStatus({
        roots: [],
        collected: collected(),
        candidateCount: 0,
        discovery: discovery(),
      })
    ).toEqual({ status: 'empty' });
  });

  it('reports a broken environment with the explicit environment reason', () => {
    const result = browserSourceStatus({
      roots: [],
      collected: collected(),
      candidateCount: 0,
      discovery: discovery({ envMissing: true }),
    });
    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('переменные окружения');
  });

  it('reports denied browser directories as unavailable with the access reason', () => {
    const result = browserSourceStatus({
      roots: [],
      collected: collected(),
      candidateCount: 0,
      discovery: discovery({ denied: [{ root: 'C:\\...\\Chrome\\User Data', code: 'EACCES' }] }),
    });
    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('права администратора');
  });

  it('reports all discovered cache roots unreadable as unavailable', () => {
    const result = browserSourceStatus({
      roots: ['C:\\...\\Default\\Cache'],
      collected: collected({
        unavailableRoots: [{ root: 'C:\\...\\Default\\Cache', code: 'EPERM' }],
      }),
      candidateCount: 0,
      discovery: discovery(),
    });
    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('права администратора');
  });

  it('stays partial when a denied profile coexists with readable cache roots', () => {
    const result = browserSourceStatus({
      roots: ['C:\\...\\Default\\Cache'],
      collected: collected(),
      candidateCount: 1,
      discovery: discovery({ denied: [{ root: 'C:\\...\\Edge\\User Data', code: 'EACCES' }] }),
    });
    expect(result.status).toBe('partial');
    expect(result.reason).toContain('права администратора');
  });

  it('marks nested inaccessible cache directories as partial with a reason', () => {
    const result = browserSourceStatus({
      roots: ['C:\\...\\Default\\Cache'],
      collected: collected({ inaccessibleDirs: ['C:\\...\\Default\\Cache\\locked'] }),
      candidateCount: 0,
      discovery: discovery(),
    });
    expect(result.status).toBe('partial');
    expect(result.reason).toBeTruthy();
  });

  it('distinguishes an available cache root without files from an unreadable one', () => {
    const base = {
      roots: ['C:\\...\\Default\\Cache'],
      collected: collected(),
      discovery: discovery(),
    };
    expect(browserSourceStatus({ ...base, candidateCount: 0 })).toEqual({ status: 'empty' });
    expect(browserSourceStatus({ ...base, candidateCount: 3 })).toEqual({ status: 'ok' });
  });

  it('lets a prepared browser status override the generic calculation', () => {
    const source = buildPreviewSource({
      category: 'browser-cache',
      rules: cleanerRules(),
      roots: [],
      collected: collected(),
      candidates: [],
      status: { status: 'empty' },
    });
    expect(source).toMatchObject({ category: 'browser-cache', status: 'empty', candidateCount: 0 });
  });
});
