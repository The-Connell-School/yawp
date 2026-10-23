import { describe, expect, test } from 'bun:test';
import {
  backToSignInHref,
  cardPageLogoHref,
  shouldShowCardPageBackLink,
} from './card-page-chrome';

describe('card page logo href', () => {
  test('points signed-out visitors at the public site origin', () => {
    expect(cardPageLogoHref(false, 'https://yawp.school')).toBe(
      'https://yawp.school'
    );
  });

  test('points signed-in visitors at the app home', () => {
    expect(cardPageLogoHref(true, 'https://yawp.school')).toBe('/app');
  });
});

describe('back to sign in link visibility', () => {
  test('is hidden on /auth/login', () => {
    expect(shouldShowCardPageBackLink('/auth/login', false)).toBe(false);
  });

  test('is hidden when signed in', () => {
    expect(shouldShowCardPageBackLink('/free', true)).toBe(false);
  });

  test('is hidden on admin approval pages', () => {
    for (const path of [
      '/free/admin/approve',
      '/free/admin/approve/deny',
      '/free/admin/not-right-person',
    ] as const) {
      expect(shouldShowCardPageBackLink(path, false)).toBe(false);
    }
  });

  test('shows on a normal signed-out card page', () => {
    expect(shouldShowCardPageBackLink('/free', false)).toBe(true);
    expect(shouldShowCardPageBackLink('/auth/inv/forgot-password', false)).toBe(
      true
    );
  });
});

describe('back to sign in href', () => {
  test('preserves a safe redirectTo query param', () => {
    expect(backToSignInHref('/app/my-classes')).toBe(
      '/auth/login?redirectTo=%2Fapp%2Fmy-classes'
    );
  });

  test('drops an unsafe redirectTo value', () => {
    expect(backToSignInHref('https://evil.example')).toBe('/auth/login');
  });

  test('omits redirectTo when absent', () => {
    expect(backToSignInHref(null)).toBe('/auth/login');
  });
});
