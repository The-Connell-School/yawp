import { describe, expect, test } from 'bun:test';
import { LESSON_PLANNER_REVIEW_FLAG_SETTINGS } from '../../../../../packages/prisma/scripts/local-dev/seed-lesson-planner-feature-flag';
import { FOLDED_LESSON_PLANNER_REVIEW_FLAG_SETTINGS } from './lesson-planner-review-flags';

describe('Lesson Planner preview seed', () => {
  test('does not seed folded review-flag Setting rows', () => {
    expect(LESSON_PLANNER_REVIEW_FLAG_SETTINGS).toEqual([]);
  });

  test('documents legacy review-flag rows for operators', () => {
    expect(FOLDED_LESSON_PLANNER_REVIEW_FLAG_SETTINGS.length).toBe(13);
  });
});
