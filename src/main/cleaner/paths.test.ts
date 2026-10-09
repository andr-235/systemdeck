import { describe, expect, it } from 'vitest';
import { dedupeRoots } from './paths';

describe('cleaner path helpers', () => {
  it('collapses roots that are the same directory ignoring case and separators', () => {
    expect(dedupeRoots(['C:\\Users\\a\\Temp', 'c:/users/a/temp', 'C:\\Users\\a\\Temp\\'])).toEqual([
      'C:\\Users\\a\\Temp',
    ]);
  });

  it('keeps only the outer root when roots are nested, regardless of order', () => {
    expect(dedupeRoots(['C:\\T\\inner', 'C:\\T'])).toEqual(['C:\\T']);
    expect(dedupeRoots(['C:\\T', 'C:\\T\\inner'])).toEqual(['C:\\T']);
  });

  it('keeps sibling roots that only share a string prefix', () => {
    expect(dedupeRoots(['C:\\Temp', 'C:\\Temp2'])).toEqual(['C:\\Temp', 'C:\\Temp2']);
  });

  it('preserves the order of unrelated roots', () => {
    expect(dedupeRoots(['D:\\A', 'C:\\B', 'D:\\A\\sub'])).toEqual(['D:\\A', 'C:\\B']);
  });
});
