import { expect, test } from 'bun:test';
import { formatDateOnly } from './date-only';

test('existing callers keep the UTC calendar date and numeric format', () => {
  expect(formatDateOnly('2026-10-24T01:00:00Z')).toBe('10/24/2026');
  expect(formatDateOnly(null)).toBe('');
  expect(formatDateOnly('not a date')).toBe('');
});
test('callers can format due dates in the teacher time zone', () => {
  expect(
    formatDateOnly('2026-10-24T01:00:00Z', 'en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      year: undefined,
    })
  ).toBe('Oct 23');
});
