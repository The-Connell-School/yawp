/**
 * Fix it, don't flag it (plan item 1, Nov 22). The fixture is round 3's
 * Gatsby reply: its lesson pivots on "one of the few honest people", taught
 * as chapter 1; Nick says it at the end of chapter 3.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { readSlideDeck } from './slide-deck';
import { lessonRepairPrompt, withLessonRepair, type Problem } from './lesson-repair.server';

const GATSBY = readFileSync(join(import.meta.dir, 'fixtures', 'reply-gatsby-round-3.md'), 'utf8');
const MISPLACED: Problem = {
  what: 'The lesson places the quotation "I am one of the few honest people that I have ever known." in chapter 1; it is in chapter 3.',
  words: 'I am one of the few honest people that I have ever known.',
};
const answering = (edits: unknown) => async () => JSON.stringify({ edits });

describe('withLessonRepair', () => {
  test('every place the lesson relies on the error is fixed, the slide included, and the deck still builds', async () => {
    const result = await withLessonRepair(
      GATSBY,
      [MISPLACED],
      answering([
        {
          problem: 1,
          find: "In the opening pages of Chapter 1, Nick Carraway tells us he is 'one of the few honest people' he has ever known.",
          replace: "At the end of Chapter 3, Nick Carraway tells us he is 'one of the few honest people' he has ever known; in Chapter 1 he already claims to reserve all judgments.",
        },
        {
          problem: 1,
          find: 'Choose one moment from Chapter 1 where Nick\'s words or actions complicate his claim to honesty.',
          replace: 'Choose one moment from Chapter 1 where Nick\'s words or actions complicate his claim to reserve all judgments.',
        },
      ])
    );
    expect(result.repaired).toEqual([MISPLACED]);
    expect(result.left).toEqual([]);
    expect(result.reply).not.toContain('In the opening pages of Chapter 1, Nick Carraway tells us he is');
    expect(result.reply).toContain('his claim to reserve all judgments');
    const deck = readSlideDeck(result.reply);
    expect(deck.kind).toBe('deck');
  });

  test('an edit whose words are not in the lesson fixes nothing; the problem is left for the teacher', async () => {
    const result = await withLessonRepair(GATSBY, [MISPLACED], answering([{ problem: 1, find: 'Words that are nowhere in this lesson at all.', replace: 'x' }]));
    expect(result.reply).toBe(GATSBY);
    expect(result.left).toEqual([MISPLACED]);
  });

  test('a quotation the source text verified is never edited', async () => {
    const verified = 'I am one of the few honest people that I have ever known.';
    const result = await withLessonRepair(
      GATSBY,
      [MISPLACED],
      answering([{ problem: 1, find: '"body": "I am one of the few honest people that I have ever known."', replace: '"body": "Something else."' }]),
      { protect: [verified] }
    );
    expect(result.reply).toBe(GATSBY);
  });

  test('a repair that would break the deck is not made', async () => {
    const result = await withLessonRepair(
      GATSBY,
      [MISPLACED],
      answering([{ problem: 1, find: '"layout": "excerpt"', replace: '"layout": "nonsense"' }])
    );
    expect(result.reply).toBe(GATSBY);
    expect(result.left).toEqual([MISPLACED]);
  });

  test('no answer, or an answer that cannot be read, leaves the lesson as it was', async () => {
    expect((await withLessonRepair(GATSBY, [MISPLACED], async () => { throw new Error('down'); })).reply).toBe(GATSBY);
    expect((await withLessonRepair(GATSBY, [MISPLACED], async () => 'not json')).reply).toBe(GATSBY);
  });

  test('the repairer is shown the errors, numbered, and the whole lesson', () => {
    const prompt = lessonRepairPrompt(GATSBY, [MISPLACED, { what: 'Lee was born in 1926.', words: 'born 1925', right: 'born 1926' }]);
    expect(prompt).toContain('1. The lesson places the quotation');
    expect(prompt).toContain('2. Lee was born in 1926.');
    expect(prompt).toContain('Right: born 1926');
    expect(prompt).toContain('<lesson>');
  });
});
