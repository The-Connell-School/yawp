import { describe, expect, test } from 'bun:test';
import {
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
    expect(normalizeLoginRateLimitTargetKey('  SamStudent  ')).toBe('samstudent');
    expect(hashLoginRateLimitTarget('SamStudent')).toBe(
      hashLoginRateLimitTarget('samstudent')
    );
  });
});
