import { describe, expect, test } from 'bun:test';
import { teacherPromptAccount, signoutDestination } from './teacher-prompts';

describe('sign-on teacher prompt account selection', () => {
  test('email students keep their email even if they also have a handle', () => {
    expect(
      teacherPromptAccount({
        email: 'maya@example.test',
        username: 'maya_r',
        roles: ['STUDENT'],
      })
    ).toEqual({ kind: 'email-student', identifier: 'maya@example.test' });
  });
  test('handle-only students use a handle and the sign-out explanation', () => {
    expect(
      teacherPromptAccount({
        email: null,
        username: 'maya_r',
        roles: ['STUDENT'],
      })
    ).toEqual({ kind: 'handle-only', identifier: '@maya_r' });
  });
  test('no roles selects the neutral student message', () => {
    expect(
      teacherPromptAccount({
        email: 'maya@example.test',
        username: null,
        roles: [],
      }).kind
    ).toBe('neutral');
  });
  test('staff retain the staff variant', () => {
    expect(
      teacherPromptAccount({
        email: 'teacher@example.test',
        username: null,
        roles: ['TEACHER'],
      }).kind
    ).toBe('staff');
  });
});

describe('sign-out destination allow-list', () => {
  test('only the literal /free is accepted', () => {
    expect(signoutDestination('/free')).toBe('/free');
    for (const value of [
      null,
      undefined,
      '',
      '/',
      '/app',
      '/free/',
      '/free?x=1',
      '//evil.test',
      'https://evil.test',
      '/\\evil.test',
      '%2Ffree',
      [' /free'],
      new File([], 'free'),
    ]) {
      expect(signoutDestination(value)).toBe('/auth/login');
    }
  });
});
