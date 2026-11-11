import { describe, expect, test } from 'bun:test';
import { readFixture } from '~/domain/office/fixtures';
import { deckFromUpload } from './deck-from-upload';
import { parseSlideDeck, fenceSlideDeck } from './slide-deck';

const pictures = [
  { id: 'pic1aaaaaaaa', position: 1, width: 40, height: 30 },
  { id: 'pic4aaaaaaaa', position: 4, width: 64, height: 48 },
  { id: 'pic5aaaaaaaa', position: 5, width: 16, height: 9 },
  { id: 'pic6aaaaaaaa', position: 6, width: 30, height: 30 },
];

describe('deckFromUpload: the teacher’s deck as a Yawp! deck, slide for slide', () => {
  const made = deckFromUpload({ name: 'Elephant deck.pptx', file: new Uint8Array(readFixture('deck-pictures.pptx')), pictures })!;

  test('one slide for each of theirs, in their order, with their words', () => {
    expect(made.deck.slides.map((slide) => slide.title)).toEqual(['Observe and analyze', 'What happened', 'Your turn']);
    expect(made.deck.title).toBe('Observe and analyze');
    expect(made.leftOut).toBe(0);
  });

  test('their pictures go back on the slides that had them, the largest when there are several', () => {
    expect(made.deck.slides.map((slide) => [slide.layout, slide.image])).toEqual([
      ['picture', 'pic1aaaaaaaa'],
      ['picture', 'pic4aaaaaaaa'],
      // A picture placed on the slide over its background.
      ['picture', 'pic6aaaaaaaa'],
    ]);
  });

  test('every slide has notes, so the deck is valid and renders', () => {
    expect(made.deck.slides.every((slide) => slide.speakerNotes.length > 0)).toBe(true);
    expect(parseSlideDeck(fenceSlideDeck(made.deck))?.deck.slides).toHaveLength(3);
  });

  test('a deck that cannot be read makes nothing', () => {
    expect(deckFromUpload({ name: 'x.pptx', file: new Uint8Array([1, 2, 3]), pictures: [] })).toBeNull();
  });
});

describe('deckFromUpload: words that do not fit a slide are kept in the notes', () => {
  test('a slide with text only: a title slide, a statement, then bullets; long words go to the notes', async () => {
    const { slidesFromText } = await import('./deck-from-upload');
    const long = 'x'.repeat(400);
    const slides = slidesFromText([
      { number: 1, lines: ['Develop Your Thesis', 'The focal point of your essay'], notes: '', pictureIds: [] },
      { number: 2, lines: ['Hold this.', 'Your thesis is the focal point.'], notes: 'Say it twice.', pictureIds: [] },
      { number: 3, lines: ['Today', 'i.', 'Look closely', 'ii.', 'Quick review', 'iii.', 'Observation'], notes: '', pictureIds: [] },
      { number: 4, lines: ['A long one', long], notes: '', pictureIds: [] },
      { number: 5, lines: [], notes: '', pictureIds: [] },
      { number: 6, lines: ['Wording', '1', 'One sentence long.', '2', 'Arguable.'], notes: '', pictureIds: [] },
    ]);
    expect(slides[0]).toMatchObject({ layout: 'title', title: 'Develop Your Thesis', subtitle: 'The focal point of your essay' });
    expect(slides[1]).toMatchObject({ layout: 'statement', body: 'Your thesis is the focal point.', speakerNotes: 'Say it twice.' });
    // A list marker on its own line joins the line after it.
    expect(slides[2]).toMatchObject({ layout: 'bullets', bullets: ['i. Look closely', 'ii. Quick review', 'iii. Observation'] });
    expect(slides[3]!.body!.length).toBeLessThanOrEqual(320);
    expect(slides[3]!.speakerNotes).toContain(long);
    expect(slides[4]).toMatchObject({ layout: 'title', title: 'Slide 5' });
    expect(slides[5]).toMatchObject({ layout: 'bullets', bullets: ['1 One sentence long.', '2 Arguable.'] });
  });
});
