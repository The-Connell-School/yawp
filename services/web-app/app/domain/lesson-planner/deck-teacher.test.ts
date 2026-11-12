import { describe, expect, test } from 'bun:test';
import { withDeckTeacher } from './deck-teacher';
import { fenceSlideDeck, readSlideDeck, type SlideDeck } from './slide-deck';

const deck = (titleSlide: Record<string, unknown> = {}): SlideDeck =>
  ({
    title: 'Body Paragraphs',
    slides: [
      { layout: 'title', title: 'Body Paragraphs', course: 'English 10, Period 3', speakerNotes: 'Open.', ...titleSlide },
      { layout: 'steps', title: 'Draft it', bullets: ['One', 'Two'], speakerNotes: 'Go.' },
    ],
  }) as SlideDeck;

const reply = (d: SlideDeck) => `Here is the deck.\n\n${fenceSlideDeck(d)}\n\nWant changes?`;
const titleOf = (text: string) => {
  const outcome = readSlideDeck(text);
  if (outcome.kind !== 'deck') throw new Error('no deck');
  return outcome.deck.slides[0]!;
};

describe('withDeckTeacher (spec v4.1: the teacher’s name on the title slide, from the session)', () => {
  test('puts the name on the title slide, and leaves the rest of the reply where it was', () => {
    const out = withDeckTeacher(reply(deck()), 'Ms. Rivera');
    expect(titleOf(out).teacher).toBe('Ms. Rivera');
    expect(titleOf(out).course).toBe('English 10, Period 3');
    expect(out.startsWith('Here is the deck.')).toBe(true);
    expect(out.endsWith('Want changes?')).toBe(true);
  });

  test('a name the model wrote is replaced by the session’s, never trusted', () => {
    expect(titleOf(withDeckTeacher(reply(deck({ teacher: 'Mr. Invented' })), 'Ms. Rivera')).teacher).toBe('Ms. Rivera');
  });

  test('without a name from the session, the line is left out, even if the model wrote one', () => {
    expect(titleOf(withDeckTeacher(reply(deck({ teacher: 'Mr. Invented' })), null)).teacher).toBeUndefined();
    expect(titleOf(withDeckTeacher(reply(deck()), '   ')).teacher).toBeUndefined();
  });

  test('a reply without a readable deck, or a deck without a title slide, is untouched', () => {
    expect(withDeckTeacher('No deck here.', 'Ms. Rivera')).toBe('No deck here.');
    const noTitle = reply({ title: 'X', slides: [{ layout: 'steps', title: 'Draft', bullets: ['One'], speakerNotes: 'Go.' }] } as SlideDeck);
    expect(withDeckTeacher(noTitle, 'Ms. Rivera')).toBe(noTitle);
    const broken = 'Deck:\n```yawp-slides\n{"slides": [ oops\n```';
    expect(withDeckTeacher(broken, 'Ms. Rivera')).toBe(broken);
  });

  test('a long name is cut to the field’s 80 characters', () => {
    expect(titleOf(withDeckTeacher(reply(deck()), 'A'.repeat(120))).teacher).toHaveLength(80);
  });
});
