import { describe, expect, it } from 'vitest';
import type { CleanupCategory } from '@shared/ipc/contracts';
import {
  LOG_MIN_AGE_HOURS,
  TEMP_MIN_AGE_HOURS,
  cleanerRules,
  fileRuleFor,
  findCleanupRule,
  isRecycleVolumePath,
  matchesCleanupRule,
  minAgeHoursFor,
} from './rules';

const LOG_DIR = 'C:\\Users\\alice\\AppData\\Roaming\\SystemDeck\\logs';

function ruleFor(category: CleanupCategory, logDir: string | null = null) {
  const rules = logDir === null ? cleanerRules() : cleanerRules({}, logDir);
  const rule = fileRuleFor(category, rules);
  expect(rule, category).toBeDefined();
  return rule!;
}

describe('cleaner rules registry', () => {
  it('declares a non-empty allow root and pattern for every file rule', () => {
    const rules = cleanerRules({}, LOG_DIR).filter((rule) => rule.kind === 'file');
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.allowRoot.length, rule.category).toBeGreaterThan(0);
      expect(rule.pattern, rule.category).toBeInstanceOf(RegExp);
    }
  });

  it('covers exactly one recycle-volume rule without file-only fields', () => {
    const rules = cleanerRules({}, LOG_DIR);
    const recycle = rules.filter((rule) => rule.kind === 'recycle-volume');
    expect(recycle).toEqual([{ kind: 'recycle-volume', category: 'recycle-bin' }]);
    expect(minAgeHoursFor('recycle-bin', rules)).toBeUndefined();
  });

  it('fixes the 24 hour age threshold in the temp and log rule configuration', () => {
    expect(ruleFor('user-temp').minAgeHours).toBe(TEMP_MIN_AGE_HOURS);
    expect(ruleFor('windows-temp').minAgeHours).toBe(TEMP_MIN_AGE_HOURS);
    expect(ruleFor('log-files', LOG_DIR).minAgeHours).toBe(LOG_MIN_AGE_HOURS);
  });

  it('builds temp roots from the environment instead of hardcoded drives', () => {
    const env = { LOCALAPPDATA: 'D:\\Users\\alice\\AppData\\Local', WINDIR: 'D:\\Windows' };
    const rules = cleanerRules(env);
    expect(fileRuleFor('user-temp', rules)?.allowRoot).toBe(
      'D:\\Users\\alice\\AppData\\Local\\Temp'
    );
    expect(fileRuleFor('windows-temp', rules)?.allowRoot).toBe('D:\\Windows\\Temp');
  });

  it('drops temp and log rules when the environment or log directory is broken', () => {
    const rules = cleanerRules({});
    expect(rules.some((rule) => rule.category === 'user-temp')).toBe(false);
    expect(rules.some((rule) => rule.category === 'windows-temp')).toBe(false);
    expect(rules.some((rule) => rule.category === 'log-files')).toBe(false);
    expect(rules.some((rule) => rule.category === 'recycle-bin')).toBe(true);
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
    expect(rule.allowRoot.endsWith('\\Microsoft\\Windows\\Explorer')).toBe(true);
  });

  it('matches only rotated SystemDeck logs, never the active log or system logs', () => {
    const rule = ruleFor('log-files', LOG_DIR);
    expect(matchesCleanupRule(`${LOG_DIR}\\systemdeck.log.1`, rule)).toBe(true);
    expect(matchesCleanupRule(`${LOG_DIR}\\systemdeck.log.3`, rule)).toBe(true);
    // Активный Application Log и прочие файлы каталога — не кандидаты (issue #57).
    expect(matchesCleanupRule(`${LOG_DIR}\\systemdeck.log`, rule)).toBe(false);
    expect(matchesCleanupRule(`${LOG_DIR}\\other.log`, rule)).toBe(false);
    expect(matchesCleanupRule(`${LOG_DIR}\\systemdeck.log.1.bak`, rule)).toBe(false);
  });

  it('never builds a rule for Windows logs, event logs or system etl files', () => {
    const rules = cleanerRules({}, LOG_DIR);
    expect(findCleanupRule('C:\\Windows\\Logs\\setup.log', rules)).toBeUndefined();
    expect(
      findCleanupRule('C:\\Windows\\System32\\winevt\\Logs\\Application.evtx', rules)
    ).toBeUndefined();
    expect(findCleanupRule('C:\\Windows\\System32\\LogFiles\\setup.etl', rules)).toBeUndefined();
  });

  it('matches a Cache segment under the browser-cache allow root', () => {
    const rule = ruleFor('browser-cache');
    const path = `${rule.allowRoot}\\Chrome\\User Data\\Default\\Cache\\data_0`;
    expect(matchesCleanupRule(path, rule)).toBe(true);
  });

  it('never treats a file allow root itself as junk, unlike the recycle volume root', () => {
    expect(findCleanupRule(ruleFor('user-temp').allowRoot)).toBeUndefined();
    expect(findCleanupRule('C:\\$Recycle.Bin')?.kind).toBe('recycle-volume');
  });

  it('accepts only the exact recycle root of a drive as the aggregate candidate', () => {
    expect(isRecycleVolumePath('C:\\$Recycle.Bin')).toBe(true);
    expect(isRecycleVolumePath('c:/$Recycle.Bin')).toBe(true);
    expect(isRecycleVolumePath('C:\\$Recycle.Bin\\')).toBe(true);
    expect(isRecycleVolumePath('D:\\$Recycle.Bin')).toBe(true);
    expect(isRecycleVolumePath('C:\\$Recycle.Bin\\$R123.doc')).toBe(false);
    expect(isRecycleVolumePath('C:\\$Recycle.Bin2')).toBe(false);
    expect(isRecycleVolumePath('C:\\$Recycle.Bin\\..\\Users\\a.doc')).toBe(false);
    expect(isRecycleVolumePath('C:\\Users\\$Recycle.Bin')).toBe(false);
  });
});
