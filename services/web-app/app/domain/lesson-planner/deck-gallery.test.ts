import { describe, expect, test } from 'bun:test';
import {
  galleryAccent,
  galleryRunningHead,
  galleryTemplate,
  planGalleryDeck,
  promptTypeSize,
} from './deck-gallery';
import { deckArt } from './deck-art';
import type { Slide, SlideDeck } from './slide-deck';

const slide = (layout: Slide['layout'], extra: Partial<Slide> = {}): Slide => ({
  layout,
  title: 'A slide',
  speakerNotes: 'Say it.',
  ...extra,
});

const deckOf = (slides: Slide[], extra: Partial<SlideDeck> = {}): SlideDeck => ({
  title: 'The weight of things',
  slides,
  ...extra,
});

describe('galleryTemplate', () => {
  test('a gallery slide is its own template', () => {
    expect(galleryTemplate(slide('agenda'))).toBe('agenda');
    expect(galleryTemplate(slide('look'))).toBe('look');
  });

  test('a classic slide lands on its nearest template', () => {
    expect(galleryTemplate(slide('statement'))).toBe('big_idea');
    expect(galleryTemplate(slide('prompt'))).toBe('write');
    expect(galleryTemplate(slide('bullets'))).toBe('notes');
    expect(galleryTemplate(slide('quote'))).toBe('excerpt');
    expect(galleryTemplate(slide('closing'))).toBe('exit');
    expect(galleryTemplate(slide('steps'))).toBe('steps');
    expect(galleryTemplate(slide('compare'))).toBe('compare');
  });
});

describe('promptTypeSize: the kit sizes a prompt by its words', () => {
  test('short, medium, long', () => {
    expect(promptTypeSize('Name one thing you carry.')).toBe(80);
    expect(promptTypeSize(Array.from({ length: 20 }, () => 'word').join(' '))).toBe(64);
    expect(promptTypeSize(Array.from({ length: 35 }, () => 'word').join(' '))).toBe(54);
  });
});

describe('planGalleryDeck', () => {
  test('each slide gets its mode word and ground', () => {
    const plan = planGalleryDeck(
      deckOf([
        slide('title'),
        slide('agenda', { agenda: [{ title: 'Read' }] }),
        slide('write', { body: 'Write.' }),
        slide('exit', { body: 'One line.' }),
      ])
    );
    expect(plan.map((entry) => [entry.template, entry.mode, entry.ground])).toEqual([
      ['title', null, 'paper'],
      ['agenda', 'Today.', 'paper'],
      ['write', 'Write.', 'pine'],
      ['exit', 'Before you go.', 'accent'],
    ]);
  });

  test("the teacher's own mode word wins; a divider names its part", () => {
    const plan = planGalleryDeck(
      deckOf([slide('discuss', { question: 'Why?', mode: 'Argue.' }), slide('divider', { part: 'iv' })])
    );
    expect(plan[0]!.mode).toBe('Argue.');
    expect(plan[1]!.mode).toBe('Part iv.');
  });

  test('never two dark slides in a row, and at most one in four', () => {
    const plan = planGalleryDeck(
      deckOf([
        slide('write', { body: 'a' }),
        slide('look', { question: 'b' }),
        slide('big_idea', { body: 'c' }),
        slide('write', { body: 'd' }),
        slide('look', { question: 'e' }),
        slide('write', { body: 'f' }),
      ])
    );
    expect(plan.map((entry) => entry.dark)).toEqual([true, false, false, false, true, false]);
  });

  test('one accent wall: only the last exit gets it', () => {
    const plan = planGalleryDeck(
      deckOf([slide('exit', { body: 'a' }), slide('notes', { facts: ['b'] }), slide('exit', { body: 'c' })])
    );
    expect(plan.map((entry) => entry.ground)).toEqual(['paper', 'paper', 'accent']);
  });

  test('a divider hangs the art only when the deck has some', () => {
    expect(planGalleryDeck(deckOf([slide('divider')]))[0]!.ground).toBe('paper');
    expect(planGalleryDeck(deckOf([slide('divider')], { art: 'turner-temeraire' }))[0]!.ground).toBe('art');
  });
});

describe('the deck around the slides', () => {
  test('the accent defaults to ember', () => {
    expect(galleryAccent(deckOf([slide('title')]))).toBe('#B75F44');
    expect(galleryAccent(deckOf([slide('title')], { accent: 'indigo' }))).toBe('#2F5873');
  });

  test('the running head is the unit and the lesson', () => {
    expect(galleryRunningHead(deckOf([], { unit: 'The Things They Carried' }))).toBe(
      'The Things They Carried · The weight of things'
    );
    expect(galleryRunningHead(deckOf([]))).toBe('The weight of things');
  });

  test('art is looked up by id and always credited', () => {
    const art = deckArt('turner-temeraire');
    expect(art?.src).toBe('/lesson-planner/art/turner-temeraire.jpg');
    expect(art?.credit).toContain('Turner');
    expect(deckArt('nope')).toBeNull();
    expect(deckArt(undefined)).toBeNull();
  });
});
