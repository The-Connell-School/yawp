import { describe, expect, test } from 'bun:test';
import { formatLoungeTime } from './time';

const now = new Date('2026-10-13T15:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('formatLoungeTime', () => {
  test('recent times are relative', () => {
    expect(formatLoungeTime(ago(20_000), now)).toBe('just now');
    expect(formatLoungeTime(ago(5 * 60_000), now)).toBe('5m ago');
    expect(formatLoungeTime(ago(3 * 3_600_000), now)).toBe('3h ago');
    expect(formatLoungeTime(ago(30 * 3_600_000), now)).toBe('yesterday');
    expect(formatLoungeTime(ago(3 * 86_400_000), now)).toBe('3d ago');
  });

  test('older times show the date, with the year only when it differs', () => {
    expect(formatLoungeTime('2026-09-02T12:00:00Z', now)).toBe('Sep 2');
    expect(formatLoungeTime('2025-12-20T12:00:00Z', now)).toBe('Dec 20, 2025');
  });

  test('a future timestamp from clock skew reads as just now', () => {
    expect(formatLoungeTime(ago(-60_000), now)).toBe('just now');
  });
});
