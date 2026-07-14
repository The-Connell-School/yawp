import { describe, expect, test } from 'bun:test';

import {
  PRACTICE_HOME,
  resolveBackToPracticeHref,
} from './lesson-back-link';

describe('resolveBackToPracticeHref', () => {
  test('falls back to the library index when no origin is given', () => {
    expect(resolveBackToPracticeHref(null)).toBe(PRACTICE_HOME);
    expect(resolveBackToPracticeHref(undefined)).toBe(PRACTICE_HOME);
    expect(resolveBackToPracticeHref('')).toBe(PRACTICE_HOME);
  });

  test('returns a student to the assignment they were reviewing from', () => {
    const from = '/app/writing-lessons/assigned/assignment-123';
    expect(resolveBackToPracticeHref(from)).toBe(from);
  });

  test('preserves a self-directed session query string', () => {
    const from = '/app/writing-lessons/practice?skills=comma-splices&count=10';
    expect(resolveBackToPracticeHref(from)).toBe(from);
  });

  test('allows the library index itself', () => {
    expect(resolveBackToPracticeHref(PRACTICE_HOME)).toBe(PRACTICE_HOME);
  });

  test('rejects paths outside the writing-lessons area', () => {
    expect(resolveBackToPracticeHref('/app/settings')).toBe(PRACTICE_HOME);
    expect(resolveBackToPracticeHref('/app/writing-lessonsfake')).toBe(
      PRACTICE_HOME
    );
  });

  test('rejects absolute and protocol-relative URLs (no open redirect)', () => {
    expect(resolveBackToPracticeHref('https://evil.example.com')).toBe(
      PRACTICE_HOME
    );
    expect(resolveBackToPracticeHref('//evil.example.com')).toBe(PRACTICE_HOME);
    expect(
      resolveBackToPracticeHref('http://evil.example.com/app/writing-lessons')
    ).toBe(PRACTICE_HOME);
  });
});
