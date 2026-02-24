import { describe, expect, test } from 'bun:test';
import { normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
  test('trims and lowercases email input', () => {
    expect(normalizeEmail('  Teacher.Invited@Example.COM  ')).toBe(
      'teacher.invited@example.com'
    );
  });
});
