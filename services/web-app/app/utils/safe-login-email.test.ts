import { expect, test } from 'bun:test';
import {
  loginInitialStateFromSearch,
  loginPathWithEmail,
  safeLoginEmailPrefill,
} from './safe-login-email';

test('a normal teacher email can prefill sign-in', () => {
  expect(safeLoginEmailPrefill(' Teacher@School.edu ')).toBe(
    'Teacher@School.edu'
  );
  expect(loginPathWithEmail('teacher+class@school.edu')).toBe(
    '/auth/login?email=teacher%2Bclass%40school.edu'
  );
});

test('unsafe email values are left off the sign-in link', () => {
  for (const value of [
    null,
    undefined,
    '',
    'not-an-email',
    'teacher@school.edu\nBcc:evil@example.com',
    'javascript:alert(1)',
    'teacher@school.edu/login',
    `${'a'.repeat(321)}@school.edu`,
    'teacher@school.edu?redirectTo=https://evil.example',
  ]) {
    expect(safeLoginEmailPrefill(value)).toBeNull();
    expect(loginPathWithEmail(value)).toBe('/auth/login');
  }
});

test('login search prefills a safe email and keeps the existing notice variants', () => {
  expect(
    loginInitialStateFromSearch(
      new URLSearchParams('email=teacher@school.edu&message=existing_account')
    )
  ).toEqual({
    screen: 'entry',
    identifier: 'teacher@school.edu',
    error: undefined,
    variant: 'existing-account',
  });
  expect(
    loginInitialStateFromSearch(new URLSearchParams('googleError=1'))
  ).toMatchObject({
    screen: 'entry',
    error: "We couldn't connect to Google. Try again, or use your email below.",
  });
});

test('a verified sign-on state is not replaced by a query-string email', () => {
  const serverState = {
    screen: 'password' as const,
    identifier: 'verified@school.edu',
    flowToken: 'flow',
  };
  expect(
    loginInitialStateFromSearch(
      new URLSearchParams('email=other@evil.example'),
      serverState
    )
  ).toBe(serverState);
});
