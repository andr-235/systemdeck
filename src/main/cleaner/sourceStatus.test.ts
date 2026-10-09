import { describe, expect, it } from 'vitest';
import { buildPreviewSource, missingRootsReason, resolveSourceStatus } from './sourceStatus';
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
