import { describe, expect, test } from 'bun:test';
import { IDLE_AFTER_SECONDS, inUse } from './use-active-time';

describe("inUse: only time the teacher is there counts (Brian's round 5, item 12)", () => {
  const now = Date.parse('2026-10-26T10:00:00Z');
  test('a visible tab touched lately counts', () => {
    expect(inUse({ visible: true, lastInputAt: now - 30_000, now })).toBe(true);
  });
  test('a tab left open and untouched does not', () => {
    expect(inUse({ visible: true, lastInputAt: now - IDLE_AFTER_SECONDS * 1000, now })).toBe(false);
  });
  test('a hidden tab never does', () => {
    expect(inUse({ visible: false, lastInputAt: now, now })).toBe(false);
  });
});
