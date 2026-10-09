import { describe, expect, test } from 'bun:test';
import { RECOMMENDED_LESSON_PLANNER_PROMPTS } from '~/routes/api.domain.lesson-planner/build-system-prompt';
import { TILE_FACES } from './prompt-tiles';

describe('TILE_FACES', () => {
  test('gives every starter prompt its own icon and line', () => {
    // A prompt without a face falls back to a generic bulb and "Ask the
    // planner for it." — a card that tells the teacher nothing.
    for (const entry of RECOMMENDED_LESSON_PLANNER_PROMPTS) {
      expect(TILE_FACES[entry.id]).toBeTruthy();
    }
  });
});
