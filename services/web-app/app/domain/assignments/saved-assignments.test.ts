import { describe, expect, test } from 'bun:test';
import { defaultPointValueForKind } from './saved-assignments';

// Brian's round 4, item 2: short daily writing opens at 20 points.
describe('defaultPointValueForKind', () => {
  test('Class Starter and Exit Ticket open at 20', () => {
    expect(defaultPointValueForKind('class_starter')).toBe(20);
    expect(defaultPointValueForKind('exit_ticket')).toBe(20);
  });

  test('every other type keeps 100', () => {
    expect(defaultPointValueForKind('daily_pages')).toBe(100);
    expect(defaultPointValueForKind(null)).toBe(100);
    expect(defaultPointValueForKind(undefined)).toBe(100);
  });
});
