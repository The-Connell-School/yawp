/**
 * The Lesson Deck Kit, spec v4.1 (Nov 11): what it changes on top of spec v4.
 * Fraunces Bold for titles and headlines, no running head, no labels that
 * tell students how to treat the content, and a title slide that names the
 * teacher, then the class and date.
 */
import { describe, expect, test } from 'bun:test';
import {
  KIT_V4,
  isKitV4,
  isKitV41,
  kitV41PromptSize,
  kitV4Colors,
  layoutKitV4Slide,
  planKitV4Deck,
  withDeckKit,
  type KitV4Element,
} from './deck-kit-v4';
import { readSlideDeck, fenceSlideDeck, type Slide, type SlideDeck } from './slide-deck';

const notes = { speakerNotes: 'Say this.' };
const slide = (fields: Partial<Slide> & Pick<Slide, 'layout' | 'title'>): Slide =>
  ({ ...notes, ...fields }) as Slide;

const deck = (slides: Slide[], extra: Partial<SlideDeck> = {}): SlideDeck => ({
  title: 'Lesson 3: Body Paragraphs',
  unit: 'The Critical Essay',
  slides,
  ...extra,
});

const SLIDES: Slide[] = [
  slide({ layout: 'title', title: 'Body Paragraphs', subtitle: 'Build on your thesis', teacher: 'Ms. Okafor', course: 'English 10, November 12' }),
  slide({ layout: 'agenda', title: 'Today’s program', body: 'We build one paragraph together.', agenda: [{ title: 'Warm up', minutes: 5 }, { title: 'Model', minutes: 15 }, { title: 'Write', minutes: 20 }] }),
  slide({ layout: 'steps', title: 'Draft your topic sentence', bullets: ['Reread your thesis', 'Pick one reason', 'Write the sentence'], minutes: 6 }),
  slide({ layout: 'discuss', title: 'Class discussion', question: 'Which reason is strongest, and why?', grouping: 'Pairs', minutes: 4 }),
  slide({ layout: 'write', title: 'Quick write', body: 'What does your first reason prove?', routine: 'Class starter', minutes: 5 }),
  slide({ layout: 'notes', title: 'The essay’s parts', facts: ['A thesis names the claim', 'Each body paragraph proves one reason'] }),
  slide({ layout: 'big_idea', title: 'Idea', body: 'Great thesis statements lead to great essays.', followUp: 'So what makes one great?' }),
  slide({ layout: 'read', title: 'Read the sample', body: 'Follow along.', tasks: [{ verb: 'Underline', text: 'the thesis' }] }),
  slide({ layout: 'divider', title: 'We draft.', processStep: 4, subtitle: 'One paragraph, start to finish' }),
  slide({ layout: 'exit', title: 'Before you go', body: 'Bring your draft tomorrow.', button: 'Exit ticket', nextLesson: 'Conclusions' }),
];

const v4 = deck(SLIDES, { art: 'hokusai-great-wave', kit: 'v4' });
const v41 = deck(SLIDES, { art: 'hokusai-great-wave', kit: 'v4.1' });

const runsOf = (elements: KitV4Element[]) =>
  elements.flatMap((element) => (element.kind === 'text' ? element.paras.flatMap((para) => para.runs) : []));
const everyRun = (of: SlideDeck) => of.slides.flatMap((_, index) => runsOf(layoutKitV4Slide(of, index).elements));
const at = (layout: string, of: SlideDeck = v41) => of.slides.findIndex((s) => s.layout === layout);
const runs = (layout: string, of: SlideDeck = v41) => runsOf(layoutKitV4Slide(of, at(layout, of)).elements);

describe('withDeckKit: spec v4.1 sits on top of spec v4', () => {
  const plain = deck([slide({ layout: 'title', title: 'X' })]);

  test('v4.1 where both flags are on, v4 where only v4 is, nothing otherwise', () => {
    expect(withDeckKit(plain, { deckKitV4: true, deckKitV41: true }).kit).toBe('v4.1');
    expect(withDeckKit(plain, { deckKitV4: true, deckKitV41: false }).kit).toBe('v4');
    expect(withDeckKit(plain, { deckKitV4: true }).kit).toBe('v4');
    expect(withDeckKit(plain, { deckKitV4: false, deckKitV41: true })).toBe(plain);
    expect(plain.kit).toBeUndefined();
  });

  test('a v4.1 deck is still drawn by the v4 layout', () => {
    expect(isKitV4(v41)).toBe(true);
    expect(isKitV41(v41)).toBe(true);
    expect(isKitV41(v4)).toBe(false);
    expect(isKitV41(deck([]))).toBe(false);
  });

  test('the kit is never stored with the deck', () => {
    const stored = readSlideDeck(`Here.\n\n${fenceSlideDeck(v41)}`);
    expect(stored.kind).toBe('deck');
    expect(stored.kind === 'deck' && stored.deck.kit).toBeUndefined();
    // The teacher's name on the title slide is part of the deck, and is kept.
    expect(stored.kind === 'deck' && stored.deck.slides[0]!.teacher).toBe('Ms. Okafor');
  });
});

describe('spec v4.1: no running head', () => {
  test('no content slide carries the lesson’s name', () => {
    v41.slides.forEach((_, index) => {
      const elements = layoutKitV4Slide(v41, index).elements;
      expect(elements.some((element) => element.kind === 'text' && element.role === 'running-head')).toBe(false);
      if (index > 0) expect(runsOf(elements).some((run) => run.text === 'Body Paragraphs')).toBe(false);
    });
  });

  test('spec v4 keeps its running head', () => {
    const elements = layoutKitV4Slide(v4, at('steps', v4)).elements;
    expect(elements.some((element) => element.kind === 'text' && element.role === 'running-head')).toBe(true);
  });
});

describe('spec v4.1: labels never tell students how to treat the content', () => {
  const label = (layout: string, of: SlideDeck = v41) => planKitV4Deck(of)[at(layout, of)]!.label;

  test('no "Hold this", "Know this" or "Read" by default', () => {
    expect(label('big_idea')).toBeNull();
    expect(label('notes')).toBeNull();
    expect(label('read')).toBeNull();
  });

  test('labels that mark a task, a step or the close stay', () => {
    expect(label('steps')).toBe('Do');
    expect(label('discuss')).toBe('Talk');
    expect(label('write')).toBe('Write');
    expect(label('divider')).toBe('Step 4');
    expect(label('exit')).toBe('Before you go');
  });

  test('one the deck asks for is dropped too, however it is written', () => {
    const asked = deck(
      ['Hold this.', 'know this', 'Read', 'Remember:', 'Combine'].map((mode) =>
        slide({ layout: 'big_idea', title: 'Idea', body: 'Two ideas make one.', mode })
      ),
      { kit: 'v4.1' }
    );
    expect(planKitV4Deck(asked).map((plan) => plan.label)).toEqual([null, null, null, null, 'Combine']);
  });

  test('spec v4 keeps them', () => {
    expect(label('big_idea', v4)).toBe('Hold this');
    expect(label('notes', v4)).toBe('Know this');
  });
});

describe('spec v4.1: Fraunces Bold for titles and headlines', () => {
  test('the title, in Fraunces Bold at 66–84px', () => {
    const title = runs('title').find((run) => run.text === 'Body Paragraphs')!;
    expect(title).toMatchObject({ face: 'display', bold: true, color: KIT_V4.ink });
    expect(title.size).toBeGreaterThanOrEqual(66);
    expect(title.size).toBeLessThanOrEqual(84);
    const long = deck([slide({ layout: 'title', title: 'Introducing the Thesis-Driven Essay' })], { kit: 'v4.1' });
    expect(runsOf(layoutKitV4Slide(long, 0).elements).find((run) => run.face === 'display')!.size).toBe(66);
  });

  test('headlines on a panel, on cream and on a divider', () => {
    expect(runs('steps').find((run) => run.text === 'Draft your topic sentence')).toMatchObject({ face: 'display', bold: true, color: KIT_V4.white });
    expect(runs('agenda').find((run) => run.text === 'Today')).toMatchObject({ face: 'display', bold: true });
    expect(runs('divider').find((run) => run.text === 'We draft.')).toMatchObject({ face: 'display', bold: true });
    expect(runs('big_idea').find((run) => run.text.startsWith('Great thesis'))).toMatchObject({ face: 'display', bold: true });
  });

  test('a prompt over 40px is Fraunces Bold; at 40px and under it is Georgia', () => {
    expect(runs('write').find((run) => run.text === 'What does your first reason prove?')).toMatchObject({ face: 'display', size: 64 });
    const long = deck([slide({ layout: 'write', title: 'Write', body: Array(45).fill('word').join(' '), minutes: 5 })], { kit: 'v4.1' });
    expect(runsOf(layoutKitV4Slide(long, 0).elements).find((run) => run.text.startsWith('word'))).toMatchObject({ face: 'serif', size: 34 });
  });

  test('prompt sizes by length: 64 up to 12 words, 54 up to 24, 44 up to 40, then 34', () => {
    expect(kitV41PromptSize('One two three')).toBe(64);
    expect(kitV41PromptSize(Array(20).fill('word').join(' '))).toBe(54);
    expect(kitV41PromptSize(Array(35).fill('word').join(' '))).toBe(44);
    expect(kitV41PromptSize(Array(50).fill('word').join(' '))).toBe(34);
  });

  test('the timer is a 200px Fraunces Bold numeral in the deck color', () => {
    expect(runs('write').find((run) => run.text === '5')).toMatchObject({ face: 'display', bold: true, size: 200, color: kitV4Colors(v41)[0] });
  });

  test('Fraunces is always bold and over 40px; Georgia is never bold; nothing else', () => {
    for (const run of everyRun(v41)) {
      expect(['display', 'serif', 'sans']).toContain(run.face);
      if (run.face === 'display') {
        expect(run.bold).toBe(true);
        expect(run.size).toBeGreaterThan(40);
      }
      if (run.face === 'serif') {
        expect(run.bold).toBeFalsy();
        expect(run.size).toBeLessThanOrEqual(40);
        expect(run.size).toBeGreaterThanOrEqual(24);
      }
      expect(run.size).toBeGreaterThanOrEqual(14);
    }
  });

  test('list numerals and the subtitle stay in Georgia', () => {
    expect(runs('agenda').find((run) => run.text === '1')).toMatchObject({ face: 'serif', color: kitV4Colors(v41)[0] });
    expect(runs('title').find((run) => run.text === 'Build on your thesis')).toMatchObject({ face: 'serif', color: kitV4Colors(v41)[0] });
  });

  test('spec v4 has no Fraunces', () => {
    expect(everyRun(v4).some((run) => run.face === 'display')).toBe(false);
    expect(runs('write', v4).find((run) => run.text === '5')).toMatchObject({ face: 'serif', size: 220 });
  });
});

describe('spec v4.1: the title slide', () => {
  test('the unit as a kicker, then the teacher’s name, then class and date', () => {
    const elements = layoutKitV4Slide(v41, 0).elements;
    const all = runsOf(elements);
    expect(all.find((run) => run.text === 'The Critical Essay')).toMatchObject({ face: 'sans', color: KIT_V4.grey });
    const texts = all.map((run) => run.text);
    expect(texts.indexOf('Ms. Okafor')).toBeGreaterThan(texts.indexOf('Build on your thesis'));
    expect(texts.indexOf('English 10, November 12')).toBeGreaterThan(texts.indexOf('Ms. Okafor'));
    expect(all.find((run) => run.text === 'Ms. Okafor')).toMatchObject({ face: 'sans', color: KIT_V4.grey });
  });

  test('without a teacher’s name the line is left out', () => {
    const anon = deck([slide({ layout: 'title', title: 'Body Paragraphs', course: 'English 10' })], { kit: 'v4.1' });
    const texts = runsOf(layoutKitV4Slide(anon, 0).elements).map((run) => run.text);
    expect(texts).toContain('English 10');
    expect(texts.some((text) => /teacher/i.test(text))).toBe(false);
  });

  test('never "Yawp! Writing Program"', () => {
    const old = deck([slide({ layout: 'title', title: 'Body Paragraphs', course: 'Yawp! Writing Program' })], { kit: 'v4.1' });
    expect(runsOf(layoutKitV4Slide(old, 0).elements).some((run) => /writing program/i.test(run.text))).toBe(false);
    // Spec v4 still shows what the deck says.
    const before = { ...old, kit: 'v4' as const };
    expect(runsOf(layoutKitV4Slide(before, 0).elements).some((run) => /writing program/i.test(run.text))).toBe(true);
  });

  test('the lesson’s name appears on the title slide only', () => {
    const named = deck(SLIDES, { title: 'Body Paragraphs', kit: 'v4.1' });
    named.slides.forEach((_, index) => {
      const said = runsOf(layoutKitV4Slide(named, index).elements).some((run) => run.text === 'Body Paragraphs');
      expect(said).toBe(index === 0);
    });
  });
});

describe('spec v4.1: the page', () => {
  test('every slide is cream, and a column is centered top to bottom', () => {
    v41.slides.forEach((_, index) => {
      const layout = layoutKitV4Slide(v41, index);
      expect(layout.background).toBe(KIT_V4.cream);
    });
    const column = layoutKitV4Slide(v41, at('steps')).elements.find((element) => element.kind === 'text' && element.valign === 'middle')!;
    expect(column.y + column.h / 2).toBe(360);
  });

  test('a picture students study is about 1000px wide, with a narrow column beside it', () => {
    const look = deck([slide({ layout: 'look', title: 'Look', question: 'What do you notice first?' })], { art: 'hokusai-great-wave', kit: 'v4.1' });
    const elements = layoutKitV4Slide(look, 0).elements;
    const art = elements.find((element) => element.kind === 'art')!;
    expect(art.w).toBeGreaterThanOrEqual(1000);
    const words = elements.filter((element) => element.kind === 'text');
    for (const text of words) {
      const overlaps = text.x < art.x + art.w && text.x + text.w > art.x && text.y < art.y + art.h && text.y + text.h > art.y;
      expect(overlaps).toBe(false);
    }
  });

  test('never puts text over the art', () => {
    v41.slides.forEach((_, index) => {
      const elements = layoutKitV4Slide(v41, index).elements;
      const arts = elements.filter((element) => element.kind === 'art');
      const words = elements.filter((element) => element.kind === 'text');
      for (const art of arts) {
        for (const text of words) {
          const overlaps = text.x < art.x + art.w && text.x + text.w > art.x && text.y < art.y + art.h && text.y + text.h > art.y;
          expect(overlaps).toBe(false);
        }
      }
    });
  });
});

describe('words that did not fit (bot test, Nov 19)', () => {
  const panelHeadline = (title: string, kit: 'v4' | 'v4.1') => {
    const of = deck([slide({ layout: 'steps', title, bullets: ['One', 'Two'] })], { kit });
    return runsOf(layoutKitV4Slide(of, 0).elements).find((run) => run.text === title)!;
  };
  // The panel's text box is 380 wide. Fraunces Bold runs about 0.6 of its size a letter; Georgia about 0.55.
  const longestWordWidth = (run: { text: string; size: number; face: string }) =>
    Math.max(...run.text.split(/\s+/).map((word) => word.length)) * run.size * (run.face === 'display' ? 0.6 : 0.55);

  test('a long word in a panel headline is set small enough to fit on a line: "Foreshadowing", not "Foreshadowin"', () => {
    for (const kit of ['v4', 'v4.1'] as const) {
      for (const title of ['Foreshadowing hunt', 'Counterarguments', 'Characterization']) {
        expect(longestWordWidth(panelHeadline(title, kit))).toBeLessThanOrEqual(380);
      }
    }
    expect(panelHeadline('Foreshadowing hunt', 'v4.1').size).toBe(44);
  });

  test('a headline of short words is set as large as before', () => {
    expect(panelHeadline('Read the map', 'v4.1').size).toBe(58);
    expect(panelHeadline('Draft your topic sentence', 'v4.1').size).toBe(50);
    expect(panelHeadline('Read the map', 'v4').size).toBe(60);
  });

  const HARLEM = [
    'What happens to a dream deferred?',
    '',
    'Does it dry up',
    'like a raisin in the sun?',
    'Or fester like a sore—',
    'And then run?',
    'Does it stink like rotten meat?',
    'Or crust and sugar over—',
    'like a syrupy sweet?',
    '',
    'Maybe it just sags',
    'like a heavy load.',
    '',
    'Or does it explode?',
  ].join('\n');
  const passage = (body: string, kit: 'v4' | 'v4.1' = 'v4.1') => {
    const of = deck([slide({ layout: 'excerpt', title: 'Annotate', body, author: 'Langston Hughes', work: 'Harlem' })], { kit });
    return runsOf(layoutKitV4Slide(of, 0).elements).find((run) => run.text === body)!;
  };
  // The cream column is 660 wide and 560 tall, with the credit line under the passage.
  const passageHeight = (run: { text: string; size: number }) =>
    run.text.split('\n').reduce((lines, line) => lines + Math.max(1, Math.ceil((line.length * run.size * 0.52) / 660)), 0) * run.size * 1.45;

  test('a poem is set by its lines, so its first line and its last are on the slide', () => {
    for (const kit of ['v4', 'v4.1'] as const) {
      const run = passage(HARLEM, kit);
      expect(run.size).toBeLessThan(30);
      expect(passageHeight(run)).toBeLessThanOrEqual(500);
    }
  });

  test('a short passage is set as large as before; a long one steps down until it fits', () => {
    expect(passage('It was a long time ago, and the river was the only road there was.').size).toBe(30);
    const long = Array.from({ length: 90 }, (_, i) => (i % 7 ? 'river' : 'independence')).join(' ');
    const run = passage(long.slice(0, 320));
    expect(run.size).toBeLessThanOrEqual(30);
    expect(passageHeight(run)).toBeLessThanOrEqual(500);
  });
});
