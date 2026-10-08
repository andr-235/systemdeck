import { describe, expect, it } from 'vitest';
import { cleanerDenyRoots, isProtectedPath } from './protectedPaths';
import { windowsDir } from './systemRoots';

describe('cleaner protected paths', () => {
  it('denies every file under a deny root derived from SystemRoot', () => {
    expect(cleanerDenyRoots().length).toBeGreaterThan(0);
    expect(isProtectedPath(`${windowsDir()}\\System32\\drivers\\etc\\hosts`)).toBe(true);
  });

  it('does not protect the windows temp allow root', () => {
    expect(isProtectedPath(`${windowsDir()}\\Temp\\session.tmp`)).toBe(false);
  });

  it('does not match sibling prefixes without a segment boundary', () => {
    expect(isProtectedPath(`${windowsDir()}\\System32evil\\payload.dll`)).toBe(false);
    expect(isProtectedPath(`${windowsDir()}2\\System32\\payload.dll`)).toBe(false);
  });

  it('compares case-insensitively with normalized slashes', () => {
    const slashed = `${windowsDir()}\\System32\\drivers\\etc\\hosts`.replace(/\\/g, '/');
    expect(isProtectedPath(slashed.toLowerCase())).toBe(true);
  });
});
