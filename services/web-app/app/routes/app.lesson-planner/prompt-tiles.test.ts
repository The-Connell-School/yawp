import { describe, expect, test } from 'bun:test';
import { RECOMMENDED_LESSON_PLANNER_PROMPTS } from '~/routes/api.domain.lesson-planner/build-system-prompt';
import { FEATURED_TILE_IDS, splitTiles, TILE_FACES } from './prompt-tiles';

describe('TILE_FACES', () => {
  test('gives every starter prompt its own icon and line', () => {
    // A prompt without a face falls back to a generic bulb and "Ask the
    // planner for it." — a card that tells the teacher nothing.
    for (const entry of RECOMMENDED_LESSON_PLANNER_PROMPTS) {
      expect(TILE_FACES[entry.id]).toBeTruthy();
    }
  });
});

describe('splitTiles', () => {
  test('leads with six cards and keeps the rest one click away', () => {
    // Twelve cards is a menu to read before a teacher has typed anything.
    const { featured, more } = splitTiles(RECOMMENDED_LESSON_PLANNER_PROMPTS);
    expect(featured).toHaveLength(6);
    expect(featured.length + more.length).toBe(
      RECOMMENDED_LESSON_PLANNER_PROMPTS.length
    );
    expect(featured.map((entry) => entry.id)).toEqual([...FEATURED_TILE_IDS]);
  });

  test('every featured id is a real starter prompt', () => {
    const ids = new Set(RECOMMENDED_LESSON_PLANNER_PROMPTS.map((p) => p.id));
    for (const id of FEATURED_TILE_IDS) expect(ids.has(id)).toBe(true);
  });

  test('a prompt list with none of the featured ids still shows everything', () => {
    const { featured, more } = splitTiles([
      { id: 'other', label: 'Other', prompt: 'Other' },
    ]);
    expect(featured.map((entry) => entry.id)).toEqual(['other']);
    expect(more).toEqual([]);
  });
});
