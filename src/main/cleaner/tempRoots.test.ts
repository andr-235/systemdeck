import { describe, expect, it } from 'vitest';
import { userTempBase, userTempRoots, windowsTempRoot } from './tempRoots';

const LOCAL = 'C:\\Users\\alice\\AppData\\Local';
const BASE = `${LOCAL}\\Temp`;

describe('user temp roots', () => {
  it('uses the standard %LOCALAPPDATA%\\Temp base as the confirmed root', () => {
    expect(userTempRoots({ LOCALAPPDATA: LOCAL })).toEqual([BASE]);
    expect(userTempBase({ LOCALAPPDATA: LOCAL })).toBe(BASE);
  });

  it('merges a %TEMP% equal to the base without duplicating the root', () => {
    expect(userTempRoots({ LOCALAPPDATA: LOCAL, TEMP: BASE, TMP: BASE })).toEqual([BASE]);
    expect(userTempRoots({ LOCALAPPDATA: LOCAL, TEMP: `${BASE}\\`.toUpperCase() })).toEqual([BASE]);
  });

  it('keeps a %TEMP% nested inside the base but drops the covered inner root', () => {
    expect(userTempRoots({ LOCALAPPDATA: LOCAL, TEMP: `${BASE}\\nested` })).toEqual([BASE]);
  });

  it('ignores %TEMP%/%TMP% pointing outside the allowed area', () => {
    const outside = [
      'C:\\Temp',
      'D:\\Temp',
      `${LOCAL}\\Temp2`,
      'C:\\Users\\alice\\Documents\\Temp',
      'C:\\Windows\\Temp',
      'C:\\Users\\alice\\AppData\\Roaming\\Temp',
    ];
    for (const temp of outside) {
      expect(userTempRoots({ LOCALAPPDATA: LOCAL, TEMP: temp }), temp).toEqual([BASE]);
    }
  });

  it('ignores a %TEMP% value that is damaged or uses dot segments', () => {
    for (const temp of ['', 'Temp', 'C:\\Users\\alice\\..\\Temp', 'C:\\Users\\./Temp']) {
      expect(userTempRoots({ LOCALAPPDATA: LOCAL, TEMP: temp }), temp).toEqual([BASE]);
    }
  });

  it('returns no root when the allowed area itself is unknown', () => {
    expect(userTempRoots({})).toEqual([]);
    expect(userTempRoots({ TEMP: BASE })).toEqual([]);
  });
});

describe('windows temp root', () => {
  it('derives the root from %WINDIR% including a non-standard system drive', () => {
    expect(windowsTempRoot({ WINDIR: 'D:\\Windows' })).toBe('D:\\Windows\\Temp');
    expect(windowsTempRoot({ SystemRoot: 'E:\\WinNT' })).toBe('E:\\WinNT\\Temp');
  });

  it('returns null instead of guessing when the environment variable is broken', () => {
    expect(windowsTempRoot({})).toBeNull();
    expect(windowsTempRoot({ WINDIR: '' })).toBeNull();
    expect(windowsTempRoot({ WINDIR: 'Windows' })).toBeNull();
    expect(windowsTempRoot({ WINDIR: 'C:\\Windows\\..\\System' })).toBeNull();
  });
});
