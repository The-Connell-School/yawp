import { describe, expect, test } from 'bun:test';
import { firstNameFromFullName, restOfNameFromFullName } from './personalize';

describe('firstNameFromFullName', () => {
  test('falls back to Student when missing', () => {
    expect(firstNameFromFullName('')).toBe('Student');
    expect(firstNameFromFullName(null)).toBe('Student');
    expect(firstNameFromFullName(undefined)).toBe('Student');
  });
});

describe('restOfNameFromFullName', () => {
  test('returns every name part after the first, e.g. the last name', () => {
    expect(restOfNameFromFullName('Sophia Marín')).toEqual(['Marín']);
  });

  test('returns each remaining part separately for a multi-part name', () => {
    expect(restOfNameFromFullName('Mary Jane Smith')).toEqual([
      'Jane',
      'Smith',
    ]);
  });

  test('returns an empty array for a single-word or missing name', () => {
    expect(restOfNameFromFullName('Sophia')).toEqual([]);
    expect(restOfNameFromFullName('')).toEqual([]);
    expect(restOfNameFromFullName(null)).toEqual([]);
    expect(restOfNameFromFullName(undefined)).toEqual([]);
  });
});
