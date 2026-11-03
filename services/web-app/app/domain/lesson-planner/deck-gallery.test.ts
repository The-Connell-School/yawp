import { describe, expect, test } from 'bun:test';
import {
  galleryColors,
  galleryRunningHead,
  galleryTemplate,
  planGalleryDeck,
  promptTypeSize,
} from './deck-gallery';
import { artCredit, deckArt } from './deck-art';
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

describe('promptTypeSize: spec v3 sizes a prompt by its words', () => {
  test('12 words or fewer at 68px, up to 24 at 54, up to 40 at 46', () => {
    const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ');
    expect(promptTypeSize('Name one thing you carry.')).toBe(68);
    expect(promptTypeSize(words(20))).toBe(54);
    expect(promptTypeSize(words(35))).toBe(46);
  });
});

describe('planGalleryDeck', () => {
  test('each slide gets its mode word and ground; the agenda’s is Today’s program', () => {
    const plan = planGalleryDeck(
      deckOf([
        slide('title'),
        slide('agenda', { agenda: [{ title: 'Read' }] }),
        slide('notes', { title: 'Vietnam and the draft', facts: ['x'] }),
        slide('write', { body: 'What do you carry that nobody sees?' }),
        slide('exit', { body: 'One line.' }),
      ])
    );
    expect(plan.map((entry) => [entry.template, entry.mode, entry.ground])).toEqual([
      ['title', null, 'paper'],
      ['agenda', 'Today’s program', 'paper'],
      ['notes', 'Know this.', 'paper'],
      ['write', 'Write.', 'pine'],
      ['exit', 'Before you go.', 'accent'],
    ]);
  });

  test('mode words only when they do a job (spec v3)', () => {
    const plan = planGalleryDeck(
      deckOf([
        // Big ideas carry one only when the deck asks for it.
        slide('big_idea', { body: 'Weight.' }),
        slide('big_idea', { body: 'Weight.', mode: 'Hold this.' }),
        // A label that repeats the headline goes; a prompt slide's headline is its prompt.
        slide('write', { title: 'Why write?', body: 'Why do we write?' }),
        slide('notes', { title: 'Know your thesis', facts: ['x'] }),
        // Never two slides in a row that do the same thing.
        slide('read', { title: 'Opening', tasks: [{ verb: 'Mark', text: 'x' }] }),
        slide('read', { title: 'Middle', tasks: [{ verb: 'Mark', text: 'x' }] }),
        // The deck can turn one off.
        slide('discuss', { question: 'Why?', mode: 'none' }),
      ])
    );
    expect(plan.map((entry) => entry.mode)).toEqual([null, 'Hold this.', null, null, 'Read.', null, null]);
  });

  test('a slide’s own title, which it never shows, does not count as its headline', () => {
    const plan = planGalleryDeck(
      deckOf([
        slide('write', { title: 'Write', body: 'What do you carry?' }),
        slide('discuss', { title: 'Talk', question: 'What did you pick?' }),
        slide('look', { title: 'Look', question: 'What is carried here?' }),
      ])
    );
    expect(plan.map((entry) => entry.mode)).toEqual(['Write.', 'Talk.', 'Look.']);
  });

  test("the teacher's own mode word wins; a divider names its writing-process step, else its part", () => {
    const plan = planGalleryDeck(
      deckOf([
        slide('discuss', { question: 'Why?', mode: 'Argue.' }),
        slide('divider', { title: 'We write.', processStep: 2 }),
        slide('notes', { facts: ['x'] }),
        slide('divider', { title: 'We read.', part: 'iv' }),
        slide('notes', { facts: ['y'] }),
        slide('divider', { title: 'We look.' }),
      ])
    );
    expect(plan[0]!.mode).toBe('Argue.');
    expect(plan[1]!.mode).toBe('Step 2.');
    expect(plan[3]!.mode).toBe('Part iv.');
    expect(plan[5]!.mode).toBeNull();
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

  test('no more than three large appearances of the art', () => {
    const plan = planGalleryDeck(
      deckOf(
        [
          slide('title'),
          slide('big_idea', { body: 'a' }),
          slide('divider', { title: 'We read.' }),
          slide('look', { question: 'b' }),
          slide('notes', { facts: ['c'] }),
          slide('divider', { title: 'We write.' }),
        ],
        { art: 'turner-temeraire' }
      )
    );
    expect(plan.filter((entry) => entry.showArt).length).toBe(3);
    expect(plan[0]!.showArt).toBe(true);
    expect(plan[3]!.showArt).toBe(true);
    expect(plan[5]!.ground).toBe('paper');
  });

  test('colors rotate through the deck’s; title and exit wear the primary; a slide can pick', () => {
    const plan = planGalleryDeck(
      deckOf(
        [
          slide('title'),
          slide('notes', { facts: ['a'] }),
          slide('read', { tasks: [{ verb: 'Mark', text: 'x' }] }),
          slide('discuss', { question: 'Why?', color: 1 }),
          slide('exit', { body: 'b' }),
        ],
        { colors: ['#9C4A22', '#3F5A73', '#7D6118'] }
      )
    );
    expect(plan.map((entry) => entry.color)).toEqual(['#9C4A22', '#3F5A73', '#7D6118', '#9C4A22', '#9C4A22']);
  });
});

describe('the deck around the slides', () => {
  test('colors come from the painting when the deck names none', () => {
    expect(galleryColors(deckOf([slide('title')], { art: 'turner-temeraire' }))).toEqual(['#9C4A22', '#3F5A73', '#7D6118']);
    expect(galleryColors(deckOf([slide('title')], { accent: 'indigo' }))).toEqual(['#2F5873']);
  });

  test('the running head is the unit and the lesson, never a lesson or day number', () => {
    expect(galleryRunningHead(deckOf([], { unit: 'The Things They Carried' }))).toBe(
      'The Things They Carried · The weight of things'
    );
    expect(galleryRunningHead(deckOf([], { title: 'Lesson 2: Pre-Writing' }))).toBe('Pre-Writing');
    expect(galleryRunningHead(deckOf([], { title: 'Day One — What we carry' }))).toBe('What we carry');
    expect(galleryRunningHead(deckOf([], { title: 'Day One' }))).toBe('Day One');
  });

  test('art is looked up by id, with its colors, crops and credit', () => {
    const art = deckArt('turner-temeraire');
    expect(art?.src).toBe('/lesson-planner/art/turner-temeraire.jpg');
    expect(art?.crops.divider).toContain('--divider');
    expect(artCredit(art!)).toBe('J. M. W. Turner, The Fighting Temeraire, 1839');
    expect(deckArt('nope')).toBeNull();
    expect(deckArt(undefined)).toBeNull();
  });
});
