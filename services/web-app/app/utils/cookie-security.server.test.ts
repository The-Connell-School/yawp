import { describe, expect, test } from 'bun:test';
import { shouldUseSecureCookies } from './cookie-security.server';

describe('shouldUseSecureCookies', () => {
  test('keeps production cookies secure by default', () => {
    expect(shouldUseSecureCookies({ NODE_ENV: 'production' })).toBe(true);
  });

  test('allows explicit HTTP preview override', () => {
    expect(
      shouldUseSecureCookies({
        NODE_ENV: 'production',
        COOKIE_SECURE: 'false',
      })
    ).toBe(false);
  });

  test('allows explicit secure-cookie override for TLS fast previews', () => {
    expect(
      shouldUseSecureCookies({
        NODE_ENV: 'development',
        COOKIE_SECURE: 'true',
      })
    ).toBe(true);
  });
});
