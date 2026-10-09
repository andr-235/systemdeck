import { describe, expect, it } from 'vitest';
import { envDir, localAppDataDir, systemRootDir, windowsDir } from './systemRoots';

describe('system roots from environment', () => {
  it('reads %WINDIR% with %SystemRoot% as a fallback', () => {
    expect(systemRootDir({ WINDIR: 'D:\\Windows' })).toBe('D:\\Windows');
    expect(systemRootDir({ SystemRoot: 'E:\\WinNT' })).toBe('E:\\WinNT');
    expect(systemRootDir({ WINDIR: 'D:\\Windows', SystemRoot: 'E:\\WinNT' })).toBe('D:\\Windows');
  });

  it('keeps the non-standard system drive instead of a hardcoded C:\\Windows', () => {
    expect(windowsDir({ WINDIR: 'D:\\Windows' })).toBe('D:\\Windows');
    expect(localAppDataDir({ LOCALAPPDATA: 'D:\\Users\\bob\\AppData\\Local' })).toBe(
      'D:\\Users\\bob\\AppData\\Local'
    );
  });

  it('treats empty, relative, root and damaged values as broken', () => {
    for (const value of ['', '   ', 'Windows', 'C:', 'C:\\', 'C:Temp', '..\\Temp']) {
      expect(envDir({ SAMPLE: value }, 'SAMPLE'), value).toBeNull();
    }
    expect(envDir({ SAMPLE: 'C:\\Users\\..\\Temp' }, 'SAMPLE')).toBeNull();
    expect(envDir({ SAMPLE: 'C:\\Users\\./Temp' }, 'SAMPLE')).toBeNull();
    expect(envDir({}, 'SAMPLE')).toBeNull();
  });

  it('normalizes trailing separators, forward slashes and spaces of a valid value', () => {
    expect(envDir({ SAMPLE: '  C:\\Windows\\  ' }, 'SAMPLE')).toBe('C:\\Windows');
    expect(envDir({ SAMPLE: 'C:/Windows' }, 'SAMPLE')).toBe('C:\\Windows');
  });

  it('never lets a broken environment empty the protected-path deny list', () => {
    expect(windowsDir({})).toBe('C:\\Windows');
    expect(windowsDir({ WINDIR: '' })).toBe('C:\\Windows');
    expect(windowsDir({ WINDIR: 'Windows' })).toBe('C:\\Windows');
    expect(systemRootDir({ WINDIR: '', SystemRoot: '' })).toBeNull();
    expect(systemRootDir({})).toBeNull();
  });
});
