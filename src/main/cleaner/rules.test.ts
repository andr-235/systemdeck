import { describe, expect, it } from 'vitest';
import { cleanerRules, findCleanupRule, matchesCleanupRule, TEMP_MIN_AGE_HOURS } from './rules';

function ruleFor(category: string) {
  const rule = cleanerRules().find((candidate) => candidate.category === category);
  expect(rule, category).toBeDefined();
  return rule!;
}

describe('cleaner rules registry', () => {
  it('declares a non-empty allow root and pattern for every rule', () => {
    const rules = cleanerRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.allowRoot.length, rule.category).toBeGreaterThan(0);
      expect(rule.pattern, rule.category).toBeInstanceOf(RegExp);
    }
  });

  it('fixes the 24 hour age threshold in the temp rule configuration', () => {
    expect(ruleFor('user-temp').minAgeHours).toBe(TEMP_MIN_AGE_HOURS);
    expect(ruleFor('windows-temp').minAgeHours).toBe(TEMP_MIN_AGE_HOURS);
    expect(ruleFor('recycle-bin').minAgeHours).toBeUndefined();
  });

  it('builds temp roots from the environment instead of hardcoded drives', () => {
    const env = { LOCALAPPDATA: 'D:\\Users\\alice\\AppData\\Local', WINDIR: 'D:\\Windows' };
    const rules = cleanerRules(env);
    expect(rules.find((r) => r.category === 'user-temp')?.allowRoot).toBe(
      'D:\\Users\\alice\\AppData\\Local\\Temp'
    );
    expect(rules.find((r) => r.category === 'windows-temp')?.allowRoot).toBe('D:\\Windows\\Temp');
  });

  it('drops temp and log rules when the environment variables are broken', () => {
    const rules = cleanerRules({});
    expect(rules.some((r) => r.category === 'user-temp')).toBe(false);
    expect(rules.some((r) => r.category === 'windows-temp')).toBe(false);
    expect(rules.some((r) => r.category === 'log-files')).toBe(false);
    expect(rules.some((r) => r.category === 'recycle-bin')).toBe(true);
  });

  it('matches temp files under the user-temp allow root', () => {
    const rule = ruleFor('user-temp');
    expect(matchesCleanupRule(`${rule.allowRoot}\\session.tmp`, rule)).toBe(true);
  });

  it('rejects non-matching extensions under the same root', () => {
    const rule = ruleFor('user-temp');
    expect(matchesCleanupRule(`${rule.allowRoot}\\photo.jpg`, rule)).toBe(false);
  });

  it('never treats paths outside every allow root as junk', () => {
    expect(findCleanupRule('C:\\Users\\alice\\Documents\\report.docx')).toBeUndefined();
  });

  it('does not match sibling prefixes without a segment boundary', () => {
    const rule = ruleFor('windows-temp');
    expect(matchesCleanupRule(`${rule.allowRoot}2\\junk.tmp`, rule)).toBe(false);
  });

  it('matches thumbcache files under the thumbnail-cache allow root', () => {
    const rule = ruleFor('thumbnail-cache');
    expect(matchesCleanupRule(`${rule.allowRoot}\\thumbcache_256.db`, rule)).toBe(true);
    expect(matchesCleanupRule(`${rule.allowRoot}\\not-a-cache.jpg`, rule)).toBe(false);
  });

  it('matches etl logs under the log-files allow root', () => {
    const rule = ruleFor('log-files');
    expect(matchesCleanupRule(`${rule.allowRoot}\\waasmedic.etl`, rule)).toBe(true);
    expect(matchesCleanupRule(`${rule.allowRoot}\\installer.evtx`, rule)).toBe(false);
  });

  it('matches a Cache segment under the browser-cache allow root', () => {
    const rule = ruleFor('browser-cache');
    const path = `${rule.allowRoot}\\Chrome\\User Data\\Default\\Cache\\data_0`;
    expect(matchesCleanupRule(path, rule)).toBe(true);
  });

  it('never treats an allow root itself as junk', () => {
    expect(findCleanupRule(ruleFor('recycle-bin').allowRoot)).toBeUndefined();
    expect(findCleanupRule(ruleFor('user-temp').allowRoot)).toBeUndefined();
  });
});
