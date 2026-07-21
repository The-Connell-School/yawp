import { describe, expect, test } from 'bun:test';
import { formatDateOnly, toDateInputValue } from './date-only';

describe('date-only utilities', () => {
  test('format timestamps in UTC so server and browser hydration agree', () => {
    expect(formatDateOnly('2026-07-21T00:30:00.000Z')).toBe('7/21/2026');
    expect(formatDateOnly('2026-07-20T23:30:00-05:00')).toBe('7/21/2026');
  });

  test('produce a stable UTC date input value', () => {
    expect(toDateInputValue('2026-07-21T00:30:00.000Z')).toBe('2026-07-21');
  });

  test('return an empty value for absent or invalid dates', () => {
    expect(formatDateOnly(null)).toBe('');
    expect(formatDateOnly('not-a-date')).toBe('');
    expect(toDateInputValue(undefined)).toBe('');
  });
});
