import { describe, expect, test } from 'bun:test';
import { shouldRedirectClasslessStudent } from './classless-student-gate';

describe('classless student app gate', () => {
  test('returns classless students from nested app routes to the dashboard', () => {
    expect(
      shouldRedirectClasslessStudent({
        role: 'STUDENT',
        isOrgOwner: false,
        classCount: 0,
        pathname: '/app/documents/doc-1',
      })
    ).toBe(true);
  });

  test('allows the dashboard itself so the class-code dialog can render', () => {
    expect(
      shouldRedirectClasslessStudent({
        role: 'STUDENT',
        isOrgOwner: false,
        classCount: 0,
        pathname: '/app',
      })
    ).toBe(false);
  });

  test('does not gate teachers, owners, or enrolled students', () => {
    expect(
      shouldRedirectClasslessStudent({
        role: 'TEACHER',
        isOrgOwner: false,
        classCount: 0,
        pathname: '/app/assignments',
      })
    ).toBe(false);
    expect(
      shouldRedirectClasslessStudent({
        role: 'STUDENT',
        isOrgOwner: true,
        classCount: 0,
        pathname: '/app/assignments',
      })
    ).toBe(false);
    expect(
      shouldRedirectClasslessStudent({
        role: 'STUDENT',
        isOrgOwner: false,
        classCount: 1,
        pathname: '/app/assignments',
      })
    ).toBe(false);
  });
});
