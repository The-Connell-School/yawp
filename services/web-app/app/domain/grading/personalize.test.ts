import { describe, expect, test } from 'bun:test';
import { firstNameFromFullName } from './personalize';

describe('firstNameFromFullName', () => {
  test('falls back to Student when missing', () => {
    expect(firstNameFromFullName('')).toBe('Student');
    expect(firstNameFromFullName(null)).toBe('Student');
    expect(firstNameFromFullName(undefined)).toBe('Student');
  });
});
