import { describe, expect, test } from 'bun:test';
import {
  classStudentLoginRateLimitTarget,
  hashLoginRateLimitTarget,
  normalizeLoginRateLimitTargetKey,
} from './login-rate-limit-target';

describe('login rate-limit target normalization', () => {
  test('email identifiers match regardless of casing', () => {
    const a = normalizeLoginRateLimitTargetKey('Teacher@School.EDU');
    const b = normalizeLoginRateLimitTargetKey('teacher@school.edu');
    expect(a).toBe(b);
    expect(hashLoginRateLimitTarget(a)).toBe(hashLoginRateLimitTarget(b));
  });

  test('handle identifiers trim and lowercase', () => {
    expect(normalizeLoginRateLimitTargetKey('  SamStudent  ')).toBe(
      'samstudent'
    );
    expect(hashLoginRateLimitTarget('SamStudent')).toBe(
      hashLoginRateLimitTarget('samstudent')
    );
  });
});

test('class login and teacher unlock share normalization without crossing classes', () => {
  const canonical = classStudentLoginRateLimitTarget('class-a', 'BrianConnell');
  for (const handle of ['@BrianConnell', '  BrianConnell  ', 'ＢrianConnell'])
    expect(classStudentLoginRateLimitTarget('class-a', handle)).toBe(canonical);
  expect(classStudentLoginRateLimitTarget('class-b', 'BrianConnell')).not.toBe(
    canonical
  );
  expect(classStudentLoginRateLimitTarget('class-a', 'x'.repeat(200))).toBe(
    'class-a:' + 'x'.repeat(100)
  );
});
