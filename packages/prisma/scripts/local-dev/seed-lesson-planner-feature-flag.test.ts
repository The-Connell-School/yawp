import { describe, expect, test } from 'bun:test';
import { isDemoPlannerQaEnvironment } from '../seed-preview-planner-qa';

describe('ensureLessonPlannerEnabledForDemo', () => {
  test('isDemoPlannerQaEnvironment matches demo slug and database', () => {
    expect(isDemoPlannerQaEnvironment({ PREVIEW_SLUG: 'demo' })).toBe(true);
    expect(
      isDemoPlannerQaEnvironment({
        DATABASE_URL: 'postgresql://u:p@host/yawp_demo',
      })
    ).toBe(true);
    expect(isDemoPlannerQaEnvironment({ PREVIEW_SLUG: 'pr-374' })).toBe(false);
  });
});
