import { describe, expect, test } from 'bun:test';
import {
  DAY_ONE_DECK,
  THESIS_ESSAY_DECKS,
  deckBySlug,
  deckForModuleTitle,
  deckHref,
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
