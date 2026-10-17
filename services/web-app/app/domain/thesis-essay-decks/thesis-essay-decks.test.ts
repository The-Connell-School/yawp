import { describe, expect, test } from 'bun:test';
import {
  DAY_ONE_DECK,
  SAMPLE_ESSAY_HANDOUT,
  SIGN_UP_HANDOUT,
  THESIS_ESSAY_DECKS,
  THESIS_ESSAY_MATERIALS,
  deckBySlug,
  deckForModuleTitle,
  deckAssetContentType,
  deckHref,
  googleSlidesCopyHref,
  isDeckAssetName,
  materialBySlug,
  materialHref,
  materialsForDeck,
  presentHref,
} from './thesis-essay-decks';

describe('THESIS_ESSAY_DECKS', () => {
  test('has one deck per lesson, 1 to 7, in order', () => {
    expect(THESIS_ESSAY_DECKS.map((deck) => deck.lesson)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('gives every deck a unique, URL-safe slug and a .pptx file name', () => {
    const slugs = THESIS_ESSAY_DECKS.map((deck) => deck.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const deck of THESIS_ESSAY_DECKS) {
      expect(deck.slug).toMatch(/^[a-z0-9-]+$/);
      expect(deck.downloadName).toMatch(/\.pptx$/);
    }
  });

  test('spells YAWP! with its exclamation point', () => {
    expect(JSON.stringify(THESIS_ESSAY_DECKS).match(/YAWP(?!!)/g) ?? []).toEqual([]);
  });
});

describe('deckForModuleTitle', () => {
  test('matches each step of the Thesis-Driven Essay to its lesson', () => {
    expect(deckForModuleTitle('Pre-writing')?.lesson).toBe(2);
    expect(deckForModuleTitle('Thesis Statement')?.lesson).toBe(3);
    expect(deckForModuleTitle('Introduction Paragraph')?.lesson).toBe(4);
    expect(deckForModuleTitle('Body Paragraphs')?.lesson).toBe(5);
    expect(deckForModuleTitle('Conclusion Paragraph')?.lesson).toBe(6);
    expect(deckForModuleTitle('Title Your Essay!')?.lesson).toBe(7);
  });

  test('ignores case, spacing and punctuation', () => {
    expect(deckForModuleTitle('  PREWRITING ')?.lesson).toBe(2);
    expect(deckForModuleTitle('Pre-Writing')?.lesson).toBe(2);
    expect(deckForModuleTitle('thesis statement.')?.lesson).toBe(3);
  });

  test('matches nothing for steps without a deck', () => {
    expect(deckForModuleTitle('Review my Essay!')).toBeNull();
    expect(deckForModuleTitle('The Thesis-Driven Essay')).toBeNull();
    expect(deckForModuleTitle('')).toBeNull();
  });
});

describe('deckBySlug / deckHref', () => {
  test('finds a deck by its slug and builds its download address', () => {
    const deck = deckBySlug('lesson-3-thesis-statement');
    expect(deck?.lesson).toBe(3);
    expect(deck && deckHref(deck)).toBe('/api/thesis-essay-deck/lesson-3-thesis-statement');
  });

  test('finds nothing for an unknown or path-like slug', () => {
    expect(deckBySlug('nope')).toBeNull();
    expect(deckBySlug('../../etc/passwd')).toBeNull();
    expect(deckBySlug('__proto__')).toBeNull();
  });

  test('Day 1 has its own deck, which no step matches', () => {
    expect(DAY_ONE_DECK.lesson).toBe(1);
    expect(deckForModuleTitle(DAY_ONE_DECK.title)).toBeNull();
  });
});

describe('THESIS_ESSAY_MATERIALS', () => {
  test('gives every deck its lesson plan, as a PDF next to it', () => {
    for (const deck of THESIS_ESSAY_DECKS) {
      const [slides, plan] = materialsForDeck(deck);
      expect(slides).toMatchObject({ slug: deck.slug, kind: 'deck', fileName: `${deck.slug}.pptx` });
      expect(plan).toMatchObject({
        slug: `${deck.slug}-lesson-plan`,
        kind: 'lesson-plan',
        fileName: `${deck.slug}-lesson-plan.pdf`,
        contentType: 'application/pdf',
      });
      expect(plan.downloadName).toMatch(/ - Lesson Plan\.pdf$/);
    }
  });

  test('adds the student handouts to Day 1 only: sign-up, then the sample essay', () => {
    expect(materialsForDeck(DAY_ONE_DECK).map((m) => m.slug)).toEqual([
      'lesson-1-day-1',
      'lesson-1-day-1-lesson-plan',
      'student-sign-up',
      'sample-essay-bored-in-the-usa',
    ]);
    expect(materialsForDeck(THESIS_ESSAY_DECKS[1]).map((m) => m.kind)).toEqual(['deck', 'lesson-plan']);
    expect(SIGN_UP_HANDOUT.fileName).toBe('student-sign-up.pdf');
    expect(SAMPLE_ESSAY_HANDOUT).toMatchObject({
      kind: 'handout',
      fileName: 'sample-essay-bored-in-the-usa.pdf',
      contentType: 'application/pdf',
    });
  });

  test('names each handout for its link', () => {
    expect(SIGN_UP_HANDOUT.label).toBe('Student sign-up handout');
    expect(SAMPLE_ESSAY_HANDOUT.label).toMatch(/^Sample essay handout/);
  });

  test('gives every material a unique, URL-safe slug', () => {
    const slugs = THESIS_ESSAY_MATERIALS.map((material) => material.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  test('finds a material by slug, and nothing for an unknown one', () => {
    const plan = materialBySlug('lesson-2-pre-writing-lesson-plan');
    expect(plan?.kind).toBe('lesson-plan');
    expect(plan && materialHref(plan)).toBe('/api/thesis-essay-deck/lesson-2-pre-writing-lesson-plan');
    expect(materialBySlug('lesson-2-pre-writing')?.kind).toBe('deck');
    expect(materialBySlug('../student-sign-up')).toBeNull();
    expect(materialBySlug('constructor')).toBeNull();
  });
});

describe('the three ways to use a deck', () => {
  const thesis = THESIS_ESSAY_DECKS[2];

  test('presents on YAWP! at its own address', () => {
    expect(presentHref(thesis)).toBe('/present/thesis-essay/lesson-3-thesis-statement');
  });

  test('copies to Google Slides from the deck’s master copy, once there is one', () => {
    const ids = { 'lesson-3-thesis-statement': '1AbC_d-9' };
    expect(googleSlidesCopyHref(thesis, ids)).toBe('https://docs.google.com/presentation/d/1AbC_d-9/copy');
    expect(googleSlidesCopyHref(THESIS_ESSAY_DECKS[1], ids)).toBeNull();
  });

  test('ignores a master copy id that is not a Drive id', () => {
    expect(googleSlidesCopyHref(thesis, { 'lesson-3-thesis-statement': 'x/../y' })).toBeNull();
    expect(googleSlidesCopyHref(thesis, { 'lesson-3-thesis-statement': '' })).toBeNull();
  });
});

describe('deck assets', () => {
  test('accepts the images and icons the presenter draws', () => {
    expect(isDeckAssetName('fallen-man.jpg')).toBe(true);
    expect(isDeckAssetName('icons/eye.png')).toBe(true);
    expect(deckAssetContentType('fallen-man.jpg')).toBe('image/jpeg');
    expect(deckAssetContentType('icons/eye.png')).toBe('image/png');
  });

  test('refuses anything that could reach outside the asset folder', () => {
    for (const name of ['../secret.png', 'icons/../../x.png', '/etc/passwd', 'a/b/c.png', 'icons/eye.svg', 'x.png.exe', '']) {
      expect(isDeckAssetName(name)).toBe(false);
    }
  });
});
