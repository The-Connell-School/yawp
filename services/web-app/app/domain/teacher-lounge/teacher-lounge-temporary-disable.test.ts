import { describe, expect, test } from 'bun:test';

import {
  TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS,
  isTeacherLoungeTemporarilyDisabledForUser,
} from './teacher-lounge-temporary-disable';

describe('isTeacherLoungeTemporarilyDisabledForUser', () => {
  test('disables Teacher\'s Lounge for arbitrary teacher emails', () => {
    expect(
      isTeacherLoungeTemporarilyDisabledForUser({
        email: 'other.teacher@example.com',
      })
    ).toBe(true);
  });

  test('disables when email is missing', () => {
    expect(isTeacherLoungeTemporarilyDisabledForUser({ email: null })).toBe(
      true
    );
    expect(
      isTeacherLoungeTemporarilyDisabledForUser({ email: undefined })
    ).toBe(true);
  });

  test('allows Montgomery GEAR UP teacher (case-insensitive)', () => {
    for (const email of [
      TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS[0],
      'Zestlan.Simmons@mps.k12.al.us',
    ]) {
      expect(
        isTeacherLoungeTemporarilyDisabledForUser({ email })
      ).toBe(false);
    }
  });

  test('allows Eric Miller (case-insensitive)', () => {
    for (const email of [
      TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS[1],
      'Eric@TheConnellSchool.com',
    ]) {
      expect(
        isTeacherLoungeTemporarilyDisabledForUser({ email })
      ).toBe(false);
    }
  });

  test('allows Chris Davis (case-insensitive)', () => {
    for (const email of [
      TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS[2],
      'ChrisTheWriter@Mail.com',
    ]) {
      expect(
        isTeacherLoungeTemporarilyDisabledForUser({ email })
      ).toBe(false);
    }
  });
});
