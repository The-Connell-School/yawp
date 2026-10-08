import { describe, expect, test } from 'bun:test';
import { mayChangeRequiredPassword } from './required-password-change';

describe('mayChangeRequiredPassword', () => {
  test('allows only when mustChangePassword is true', () => {
    expect(mayChangeRequiredPassword({ mustChangePassword: true })).toBe(true);
    expect(mayChangeRequiredPassword({ mustChangePassword: false })).toBe(
      false
    );
  });
});
