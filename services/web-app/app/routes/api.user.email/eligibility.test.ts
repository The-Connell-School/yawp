import { describe, expect, test } from 'bun:test';
import { canRequestAccountEmail } from './eligibility';

describe('canRequestAccountEmail', () => {
  test('allows only users with no email', () => {
    expect(canRequestAccountEmail({ email: null })).toBe(true);
    expect(canRequestAccountEmail({ email: 'a@b.co' })).toBe(false);
  });
});
