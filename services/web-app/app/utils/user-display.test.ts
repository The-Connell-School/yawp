import { describe, expect, test } from 'bun:test';
import {
  formatUserContactLabel,
  formatUserDisplayName,
} from './user-display';

describe('user-display', () => {
  test('prefers name then email then handle', () => {
    expect(formatUserDisplayName({ name: 'Sam', email: 'a@b.com' })).toBe('Sam');
    expect(formatUserDisplayName({ email: 'a@b.com', username: 'sam' })).toBe(
      'a@b.com'
    );
    expect(formatUserDisplayName({ username: 'sam' })).toBe('@sam');
  });

  test('contact label uses email or handle', () => {
    expect(formatUserContactLabel({ username: 'sam' })).toBe('@sam');
    expect(formatUserContactLabel({ email: 'a@b.com', username: 'sam' })).toBe(
      'a@b.com'
    );
  });
});
