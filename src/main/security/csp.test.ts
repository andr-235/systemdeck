import { describe, expect, it } from 'vitest';
import { CSP_HEADER_NAME, CSP_POLICY, resolveCspHeaders } from './csp';

describe('Main — CSP headers (node project)', () => {
  it('returns the CSP policy outside dev', () => {
    const headers = resolveCspHeaders(false);

    expect(headers).not.toBeNull();
    expect(headers?.[CSP_HEADER_NAME]).toHaveLength(1);
    expect(headers?.[CSP_HEADER_NAME]?.[0]).toBe(CSP_POLICY);
    expect(CSP_POLICY).toContain("script-src 'self'");
  });

  it('returns null in dev so Vite HMR preamble is not blocked', () => {
    expect(resolveCspHeaders(true)).toBeNull();
  });
});
