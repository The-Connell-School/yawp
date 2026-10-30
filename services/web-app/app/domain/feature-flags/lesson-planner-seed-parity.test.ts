// PLAN item 14: every lesson_planner_* review flag in FEATURE_FLAGS is in the
// PR-preview seed list, so a future flag can't be silently missed by previews.
import { describe, expect, test } from 'bun:test';
import { FEATURE_FLAG_KEYS, LESSON_PLANNER_FLAG, featureFlagSettingName } from './feature-flags';
import { LESSON_PLANNER_REVIEW_FLAG_SETTINGS } from '../../../../../packages/prisma/scripts/local-dev/seed-lesson-planner-feature-flag';

describe('Lesson Planner preview seed parity', () => {
  const reviewKeys = FEATURE_FLAG_KEYS.filter(
    (k) => k.startsWith('lesson_planner_') && k !== LESSON_PLANNER_FLAG
  );

  test('every lesson_planner_* flag is seeded on PR previews', () => {
    const seeded = new Set<string>(LESSON_PLANNER_REVIEW_FLAG_SETTINGS);
    const missing = reviewKeys.map(featureFlagSettingName).filter((n) => !seeded.has(n));
    expect(missing).toEqual([]);
  });

  test('the seed list names only registered flags (no typos, no removed flags)', () => {
    const registered = new Set(reviewKeys.map(featureFlagSettingName));
    const unknown = [...LESSON_PLANNER_REVIEW_FLAG_SETTINGS].filter((n) => !registered.has(n));
    expect(unknown).toEqual([]);
  });
});
