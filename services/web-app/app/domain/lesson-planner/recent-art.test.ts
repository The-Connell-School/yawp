import { describe, expect, test } from 'bun:test';
import { recentArtFrom } from './recent-art';

const deck = (title: string, art?: string, unit?: string) =>
  'Here.\n\n```yawp-slides\n' +
  JSON.stringify({ title, ...(art ? { art } : {}), ...(unit ? { unit } : {}), slides: [{ layout: 'title', title, speakerNotes: 'n' }] }) +
  '\n```';

describe('recentArtFrom: the paintings on a teacher’s recent decks', () => {
  test('newest first, each painting once, decks without one skipped', () => {
    expect(
      recentArtFrom([
        deck('Conclusion Paragraph', 'turner-temeraire', 'The Critical Essay'),
        deck('Hooks'),
        deck('Endings again', 'turner-temeraire'),
        'No deck here.',
      ])
    ).toEqual([{ art: 'turner-temeraire', lesson: 'Conclusion Paragraph', unit: 'The Critical Essay' }]);
  });

  test('a painting no longer in the library is not mentioned', () => {
    expect(recentArtFrom([deck('Old', 'gone-painting')])).toEqual([]);
  });
});
