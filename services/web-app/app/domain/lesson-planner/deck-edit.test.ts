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

describe('every piece of text on a slide has a field (Brian, Nov 4)', () => {
  test('the fields a layout is made of, and any other text the slide has', async () => {
    const { slideTextFields } = await import('./deck-edit');
    const keys = (slide: Record<string, unknown>) => slideTextFields(slide as never).map((field) => field.key);
    // A picture slide's question and words.
    expect(keys({ layout: 'picture', title: 'T', image: 'p', speakerNotes: 'n' })).toEqual(['body', 'question']);
    // Text the layout does not list still gets its field: nothing on a slide is out of reach.
    expect(keys({ layout: 'look', title: 'T', question: 'Q', followUp: 'Then what?', routine: 'See-think-wonder', speakerNotes: 'n' })).toEqual([
      'question',
      'followUp',
      'routine',
    ]);
    expect(keys({ layout: 'title', title: 'T', course: 'English 9', speakerNotes: 'n' })).toEqual(['subtitle', 'course']);
  });

  test('lists a slide holds, whatever its layout', async () => {
    const { slideListFields } = await import('./deck-edit');
    expect(slideListFields({ layout: 'notes', title: 'T', facts: ['a'], speakerNotes: 'n' } as never)).toEqual(['timeline', 'facts']);
    expect(slideListFields({ layout: 'write', title: 'T', body: 'b', choices: ['x', 'y'], speakerNotes: 'n' } as never)).toEqual(['choices']);
  });
});

describe('a slide’s picture: add, replace, remove (Brian, Nov 4)', () => {
  test('adding a picture makes a picture slide and keeps its words', async () => {
    const { withSlidePicture } = await import('./deck-edit');
    expect(withSlidePicture({ layout: 'bullets', title: 'T', bullets: ['One', 'Two'], speakerNotes: 'n' }, 'pic1')).toEqual({
      layout: 'picture',
      title: 'T',
      image: 'pic1',
      body: 'One; Two',
      bullets: undefined,
      speakerNotes: 'n',
    });
    expect(withSlidePicture({ layout: 'discuss', title: 'T', question: 'Why?', speakerNotes: 'n' }, 'pic1')).toMatchObject({
      layout: 'picture',
      question: 'Why?',
      image: 'pic1',
    });
  });

  test('replacing keeps everything else', async () => {
    const { withSlidePicture } = await import('./deck-edit');
    expect(withSlidePicture({ layout: 'picture', title: 'T', image: 'old', body: 'b', speakerNotes: 'n' }, 'new')).toEqual({
      layout: 'picture',
      title: 'T',
      image: 'new',
      body: 'b',
      speakerNotes: 'n',
    });
  });

  test('removing it leaves a text slide that still has its words', async () => {
    const { withoutSlidePicture } = await import('./deck-edit');
    expect(withoutSlidePicture({ layout: 'picture', title: 'T', image: 'p', body: 'Words', speakerNotes: 'n' })).toMatchObject({
      layout: 'statement',
      body: 'Words',
      image: undefined,
    });
    expect(withoutSlidePicture({ layout: 'picture', title: 'T', image: 'p', question: 'Why?', speakerNotes: 'n' })).toMatchObject({
      layout: 'statement',
      body: 'Why?',
    });
    expect(withoutSlidePicture({ layout: 'picture', title: 'T', image: 'p', speakerNotes: 'n' })).toMatchObject({ layout: 'title' });
  });
});
