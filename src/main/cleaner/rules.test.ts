import { describe, expect, it } from 'vitest';
import { CLEANER_RULES, findCleanupRule, matchesCleanupRule } from './rules';

function ruleFor(category: string) {
  const rule = CLEANER_RULES.find((candidate) => candidate.category === category);
  expect(rule, category).toBeDefined();
  return rule!;
}

describe('cleaner rules registry', () => {
  it('declares a non-empty allow root and pattern for every rule', () => {
    expect(CLEANER_RULES.length).toBeGreaterThan(0);
    for (const rule of CLEANER_RULES) {
      expect(rule.allowRoot.length, rule.category).toBeGreaterThan(0);
      expect(rule.pattern, rule.category).toBeInstanceOf(RegExp);
    }
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
