import { describe, expect, test } from 'bun:test';
import { buildDailyPagesEngagementV2SchemaJson } from './apply-daily-pages-engagement-v2-seed';
import engagementLibrary from '../../../services/web-app/app/domain/rubrics/library/daily-pages-engagement.json';

describe('buildDailyPagesEngagementV2SchemaJson', () => {
  test('preserves teacherNotesEnabled from the current schema', () => {
    const merged = buildDailyPagesEngagementV2SchemaJson({
      outputSchema: { teacherNotesEnabled: false },
    }) as Record<string, unknown>;
    const output = merged.outputSchema as Record<string, unknown>;
    expect(output.teacherNotesEnabled).toBe(false);
    expect(merged.title).toBe(engagementLibrary.title);
  });
});
