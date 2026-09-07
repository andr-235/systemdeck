import { describe, it, expect } from 'vitest';
import { classifyProtectedProcessName } from './processProtection';

describe('processProtection — classifyProtectedProcessName (node project)', () => {
  it('marks core system processes as protected', () => {
    for (const name of [
      'lsass.exe',
      'smss.exe',
      'csrss.exe',
      'winlogon.exe',
      'services.exe',
      'svchost.exe',
    ]) {
      expect(classifyProtectedProcessName(name)).toBe(true);
    }
  });

  it('does not mark user processes as protected', () => {
    expect(classifyProtectedProcessName('chrome.exe')).toBe(false);
    expect(classifyProtectedProcessName(null)).toBe(false);
    expect(classifyProtectedProcessName('')).toBe(false);
  });
});
