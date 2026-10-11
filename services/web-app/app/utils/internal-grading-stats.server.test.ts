import { describe, expect, test } from 'bun:test';
import {
  gradingStatsQuerySchema,
  parseGradingStatsRange,
} from './internal-grading-stats.server';

describe('internal grading stats', () => {
  test('gradingStatsQuerySchema requires since and until days', () => {
    expect(
      gradingStatsQuerySchema.safeParse({ since: '2026-10-01', until: '2026-10-08' }).success
    ).toBe(true);
    expect(gradingStatsQuerySchema.safeParse({ since: 'bad' }).success).toBe(false);
  });

  test('parseGradingStatsRange rejects inverted or oversized windows', () => {
    expect(() =>
      parseGradingStatsRange({ since: '2026-10-08', until: '2026-10-01' })
    ).toThrow();
    expect(() =>
      parseGradingStatsRange({ since: '2020-01-01', until: '2026-01-01' })
    ).toThrow();
    const range = parseGradingStatsRange({
      since: '2026-10-01',
      until: '2026-10-08',
    });
    expect(range.since.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(range.until.toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });

});
