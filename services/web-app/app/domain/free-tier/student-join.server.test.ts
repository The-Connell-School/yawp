import { describe, expect, test } from 'bun:test';
import { validateUsername } from '~/utils/username';

describe('free-tier student join validation', () => {
  test('register path rejects reserved handles before hitting the database', () => {
    const result = validateUsername('admin');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('reserved');
    }
  });
});
