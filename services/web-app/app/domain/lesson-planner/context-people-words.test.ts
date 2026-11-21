/**
 * Words and people for a text's background (Kevin, Nov 21): the Leopard deck
 * used "aristocracy" and "unification" without defining them, and named
 * Garibaldi without showing him. Two slides: `define` (the words, plainly
 * defined, with an example from the book's world) and `person` (who someone
 * is, with their picture when the teacher has one).
 */
import { describe, expect, test } from 'bun:test';
import { layoutKitV4Slide, type KitV4Element } from './deck-kit-v4';
import { legacyContextSlide } from './context-slides';
import { applySlideText as applyTyped, sourceText } from './deck-on-slide';
import { classicSlide, deckPictureIds, fenceSlideDeck, parseSlideDeck, type Slide, type SlideDeck } from './slide-deck';

const DEFINE: Slide = {
  layout: 'define',
  title: 'Words for 1860',
  terms: [
    { word: 'aristocracy', definition: 'The families who held land and titles by birth, and ruled because of it.', example: 'The Prince of Salina is one of the oldest names in Sicily’s aristocracy.' },
    { word: 'unification', definition: 'Joining separate states into one country.', example: 'In 1861 the kingdoms of the peninsula became one Kingdom of Italy.' },
    { word: 'Risorgimento', definition: 'Italian for “resurgence”: the movement to unite Italy, 1815 to 1871.' },
  ],
  speakerNotes: 'Read each aloud.',
} as Slide;

const PERSON: Slide = {
  layout: 'person',
  title: 'Who’s who',
  people: [
    { name: 'Fabrizio, Prince of Salina', role: 'The Leopard', note: 'A Sicilian prince who sees his world ending.', image: 'ckpicture0001' },
    { name: 'Tancredi Falconeri', role: 'His nephew', note: 'Joins Garibaldi’s army.' },
    { name: 'Angelica Sedàra', role: 'The mayor’s daughter' },
  ],
  speakerNotes: 'Introduce each.',
} as Slide;

const deckOf = (slides: Slide[]): SlideDeck => ({ title: 'The Leopard, day 1', kit: 'v4.1', slides: [{ layout: 'title', title: 'The Leopard', speakerNotes: 'n' } as Slide, ...slides] });
const texts = (elements: KitV4Element[]) => elements.flatMap((element) => (element.kind === 'text' ? element.paras.flatMap((para) => para.runs.map((run) => run.text.trim())) : []));
const layoutOf = (slide: Slide) => {
  const deck = deckOf([slide]);
  return layoutKitV4Slide(deck, 1);
};

describe('the schema', () => {
  test('a define slide and a person slide are read from a reply', () => {
    const parsed = parseSlideDeck(fenceSlideDeck(deckOf([DEFINE, PERSON])));
    expect(parsed?.deck?.slides[1]?.layout).toBe('define');
    expect(parsed?.deck?.slides[1]?.terms?.map((term) => term.word)).toEqual(['aristocracy', 'unification', 'Risorgimento']);
    expect(parsed?.deck?.slides[2]?.layout).toBe('person');
    expect(parsed?.deck?.slides[2]?.people?.[0]?.image).toBe('ckpicture0001');
  });

  test('each needs its words or its people', () => {
    expect(parseSlideDeck(fenceSlideDeck(deckOf([{ ...DEFINE, terms: undefined } as Slide])))?.deck).toBeFalsy();
    expect(parseSlideDeck(fenceSlideDeck(deckOf([{ ...PERSON, people: undefined } as Slide])))?.deck).toBeFalsy();
  });

  test('the names a model reaches for read as these two', () => {
    for (const layout of ['vocabulary', 'vocab', 'words', 'glossary', 'definitions']) {
      expect(parseSlideDeck(fenceSlideDeck(deckOf([{ ...DEFINE, layout } as unknown as Slide])))?.deck?.slides[1]?.layout).toBe('define');
    }
    for (const layout of ['people', 'cast', 'characters', 'who']) {
      expect(parseSlideDeck(fenceSlideDeck(deckOf([{ ...PERSON, layout } as unknown as Slide])))?.deck?.slides[1]?.layout).toBe('person');
    }
  });

  test('a person’s picture is only ever one of the teacher’s, by id', () => {
    const parsed = parseSlideDeck(fenceSlideDeck(deckOf([{ ...PERSON, people: [{ name: 'Garibaldi', role: 'General', image: 'https://example.com/g.jpg' }] } as Slide])));
    expect(parsed?.deck?.slides[1]?.people?.[0]?.image).toBeUndefined();
    expect(deckPictureIds(deckOf([PERSON]))).toEqual(['ckpicture0001']);
  });
});

describe('every older look draws them as a list, nothing lost', () => {
  test('classic slides', () => {
    expect(classicSlide(DEFINE).bullets?.[0]).toBe('aristocracy: The families who held land and titles by birth, and ruled because of it.');
    expect(classicSlide(PERSON).bullets).toEqual(['Fabrizio, Prince of Salina: The Leopard', 'Tancredi Falconeri: His nephew', 'Angelica Sedàra: The mayor’s daughter']);
  });

  test('the spec v3 gallery look', () => {
    expect(legacyContextSlide(DEFINE).layout).toBe('notes');
    expect(legacyContextSlide(DEFINE).facts?.length).toBe(3);
    expect(legacyContextSlide(PERSON).facts?.[1]).toBe('Tancredi Falconeri: His nephew');
  });
});

describe('the kit draws them', () => {
  test('a define slide: each word, its meaning and its example, typed on in the studio', () => {
    const layout = layoutOf(DEFINE);
    expect(layout.template).toBe('define');
    const words = texts(layout.elements);
    expect(words).toContain('aristocracy');
    expect(words).toContain('Joining separate states into one country.');
    expect(words).toContain('In 1861 the kingdoms of the peninsula became one Kingdom of Italy.');
    const sources = layout.elements.flatMap((element) => (element.kind === 'text' ? element.paras.flatMap((para) => para.runs.map((run) => run.source)) : []));
    expect(sources).toContainEqual({ on: 'slide', field: 'terms', index: 1, key: 'definition' });
  });

  test('a person slide: the teacher’s picture where there is one, and every name and role', () => {
    const layout = layoutOf(PERSON);
    expect(layout.template).toBe('person');
    expect(layout.elements.filter((element) => element.kind === 'picture').map((element) => (element as { id: string }).id)).toEqual(['ckpicture0001']);
    const words = texts(layout.elements);
    for (const word of ['Fabrizio, Prince of Salina', 'The Leopard', 'Tancredi Falconeri', 'His nephew', 'Angelica Sedàra']) expect(words).toContain(word);
  });

  test('nothing is drawn off the slide', () => {
    for (const slide of [DEFINE, PERSON, { ...PERSON, people: PERSON.people!.slice(0, 1) } as Slide, { ...DEFINE, terms: DEFINE.terms!.slice(0, 1) } as Slide]) {
      for (const element of layoutOf(slide).elements) {
        expect(element.x).toBeGreaterThanOrEqual(0);
        expect(element.y).toBeGreaterThanOrEqual(0);
        expect(element.x + element.w).toBeLessThanOrEqual(1280);
        expect(element.y + element.h).toBeLessThanOrEqual(720);
      }
    }
  });
});

describe('the studio', () => {
  test('typing on a definition changes that definition only', () => {
    const deck = deckOf([DEFINE]);
    const next = applyTyped(deck, 1, { on: 'slide', field: 'terms', index: 0, key: 'definition' }, 'Families with land and titles by birth.');
    expect(next.slides[1]?.terms?.[0]?.definition).toBe('Families with land and titles by birth.');
    expect(next.slides[1]?.terms?.[0]?.word).toBe('aristocracy');
    expect(sourceText(next, 1, { on: 'slide', field: 'terms', index: 0, key: 'definition' })).toBe('Families with land and titles by birth.');
  });

  test('typing on a role changes that role only', () => {
    const deck = deckOf([PERSON]);
    const next = applyTyped(deck, 1, { on: 'slide', field: 'people', index: 1, key: 'role' }, 'The Prince’s nephew');
    expect(next.slides[1]?.people?.[1]?.role).toBe('The Prince’s nephew');
    expect(next.slides[1]?.people?.[1]?.name).toBe('Tancredi Falconeri');
  });
});
