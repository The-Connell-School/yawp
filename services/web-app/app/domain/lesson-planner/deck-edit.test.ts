import { describe, expect, test } from 'bun:test';
import type { SlideDeck } from './slide-deck';
import {
  deleteSlide,
  duplicateSlide,
  moveSlide,
  updateSlide,
  deckFromEditor,
} from './deck-edit';

const deck: SlideDeck = {
  title: 'Day 1',
  slides: [
    { layout: 'title', title: 'A', speakerNotes: 'a' },
    { layout: 'statement', title: 'B', body: 'b', speakerNotes: 'b', minutes: 5 },
    { layout: 'closing', title: 'C', speakerNotes: 'c' },
  ],
};

describe("deck editing (Brian's review, E2)", () => {
  test('deletes one slide and leaves the rest in order', () => {
    expect(deleteSlide(deck, 1).slides.map((slide) => slide.title)).toEqual(['A', 'C']);
  });

  test('never deletes the last slide', () => {
    const one = { ...deck, slides: [deck.slides[0]!] };
    expect(deleteSlide(one, 0).slides).toHaveLength(1);
  });

  test('moves a slide up or down, and stops at the ends', () => {
    expect(moveSlide(deck, 2, -1).slides.map((slide) => slide.title)).toEqual(['A', 'C', 'B']);
    expect(moveSlide(deck, 0, -1)).toBe(deck);
    expect(moveSlide(deck, 2, 1)).toBe(deck);
  });

  test('duplicates a slide right after itself', () => {
    expect(duplicateSlide(deck, 1).slides.map((slide) => slide.title)).toEqual(['A', 'B', 'B', 'C']);
  });

  test('updates one field of one slide', () => {
    const next = updateSlide(deck, 1, { body: 'new body' });
    expect(next.slides[1]!.body).toBe('new body');
    expect(deck.slides[1]!.body).toBe('b');
  });

  test('validates what the editor hands back, and says what is wrong', () => {
    const ok = deckFromEditor(JSON.stringify(deck));
    expect(ok.ok).toBe(true);
    const bad = deckFromEditor(
      JSON.stringify({ ...deck, slides: [{ layout: 'statement', title: 'B', speakerNotes: 'b' }] })
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.toLowerCase()).toContain('body');
    expect(deckFromEditor('not json').ok).toBe(false);
  });
});
