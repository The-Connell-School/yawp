import { describe, expect, test } from 'bun:test';
import {
  KIT_V4,
  KIT_V4_HOUSE_PALETTE,
  isEarthTone,
  kitV4Colors,
  kitV4PromptSize,
  layoutKitV4Slide,
  planKitV4Deck,
  withDeckKit,
  type KitV4Element,
} from './deck-kit-v4';
import { contrastRatio } from './deck-colors';
import type { Slide, SlideDeck } from './slide-deck';

const notes = { speakerNotes: 'Say this.' };
const slide = (fields: Partial<Slide> & Pick<Slide, 'layout' | 'title'>): Slide =>
  ({ ...notes, ...fields }) as Slide;

const deck = (slides: Slide[], extra: Partial<SlideDeck> = {}): SlideDeck => ({
  title: 'Lesson 3: Body Paragraphs',
  unit: 'The Critical Essay',
  slides,
  ...extra,
});

const lesson = deck(
  [
    slide({ layout: 'title', title: 'Body Paragraphs', subtitle: 'Build on your thesis', course: 'English 10' }),
    slide({ layout: 'agenda', title: 'Today’s program', body: 'We build one paragraph together.', agenda: [{ title: 'Warm up', minutes: 5 }, { title: 'Model', minutes: 15 }, { title: 'Write', minutes: 20 }] }),
    slide({ layout: 'steps', title: 'Draft your topic sentence', bullets: ['Reread your thesis', 'Pick one reason', 'Write the sentence'], minutes: 6 }),
    slide({ layout: 'discuss', title: 'Turn and talk', question: 'Which reason is strongest, and why?', grouping: 'Pairs', minutes: 4 }),
    slide({ layout: 'write', title: 'Quick write', body: 'What does your first reason prove?', routine: 'Class starter', minutes: 5 }),
    slide({ layout: 'notes', title: 'The essay’s parts', facts: ['A thesis names the claim', 'Each body paragraph proves one reason'] }),
    slide({ layout: 'divider', title: 'We draft.', processStep: 4, subtitle: 'One paragraph, start to finish' }),
    slide({ layout: 'divider', title: 'We revise.', part: 'iv' }),
    slide({ layout: 'exit', title: 'Before you go', body: 'Bring your draft tomorrow.', button: 'Exit ticket', nextLesson: 'Conclusions' }),
  ],
  { art: 'hokusai-great-wave' }
);

const texts = (elements: KitV4Element[]) =>
  elements.flatMap((element) => (element.kind === 'text' ? element.paras.flatMap((para) => para.runs) : []));

describe('planKitV4Deck: labels replace mode words', () => {
  const plans = planKitV4Deck(lesson);
  const label = (layout: string, at = 0) => plans.filter((plan) => plan.slide.layout === layout)[at]!.label;

  test('sentence case, no period, never on the title or the agenda', () => {
    expect(label('title')).toBeNull();
    expect(label('agenda')).toBeNull();
    expect(label('steps')).toBe('Do');
    expect(label('write')).toBe('Write');
    expect(label('notes')).toBe('Know this');
    expect(label('exit')).toBe('Before you go');
  });

  test('a label that repeats the headline is skipped', () => {
    // "Turn and talk" already says Talk.
    expect(label('discuss')).toBeNull();
  });

  test('dividers take their step, and parts are numbers, not roman numerals', () => {
    expect(label('divider', 0)).toBe('Step 4');
    expect(label('divider', 1)).toBe('Part 4');
  });

  test('a decorative label the deck asks for is dropped, a real one is cleaned up', () => {
    const [think, combine, none] = planKitV4Deck(
      deck([
        slide({ layout: 'big_idea', title: 'Idea', body: 'A claim is an argument.', mode: 'Think.' }),
        slide({ layout: 'big_idea', title: 'Idea', body: 'Two ideas make one.', mode: 'combine.' }),
        slide({ layout: 'big_idea', title: 'Idea', body: 'No label here.', mode: 'none' }),
      ])
    );
    expect(think!.label).toBeNull();
    expect(combine!.label).toBe('Combine');
    expect(none!.label).toBeNull();
  });
});

describe('planKitV4Deck: color comes as a panel or as type', () => {
  const plans = planKitV4Deck(lesson);
  const colors = kitV4Colors(lesson);

  test('steps and read take the primary panel on the left; discuss and notes the second', () => {
    const panel = (layout: string) => plans.find((plan) => plan.slide.layout === layout)!.panel;
    expect(panel('steps')).toEqual({ side: 'left', color: colors[0]! });
    expect(panel('discuss')).toEqual({ side: 'left', color: colors[1]! });
    expect(panel('notes')).toEqual({ side: 'left', color: colors[1]! });
    expect(panel('write')).toBeNull();
    expect(panel('title')).toBeNull();
  });

  test('the excerpt’s panel is on the right', () => {
    const [excerpt] = planKitV4Deck(
      deck([slide({ layout: 'excerpt', title: 'Read', body: 'In a hole in the ground there lived a hobbit.', bullets: ['Underline the place'] })])
    );
    expect(excerpt!.panel?.side).toBe('right');
  });

  test('every slide is laid out on cream, with nothing but panels and answer bands as shapes', () => {
    lesson.slides.forEach((_, index) => {
      const layout = layoutKitV4Slide(lesson, index);
      expect(layout.background).toBe(KIT_V4.cream);
      for (const element of layout.elements) {
        if (element.kind !== 'rect') continue;
        expect(['panel', 'band']).toContain(element.role);
      }
    });
  });
});

describe('layoutKitV4Slide: type', () => {
  const all = lesson.slides.flatMap((_, index) => texts(layoutKitV4Slide(lesson, index).elements));

  test('Georgia is never bold, nothing is italic, only Georgia and Arial', () => {
    for (const run of all) {
      expect(['serif', 'sans']).toContain(run.face);
      if (run.face === 'serif') expect(run.bold).toBeFalsy();
      expect((run as { italic?: boolean }).italic).toBeUndefined();
    }
  });

  test('reading type is never under the kit’s minimum', () => {
    for (const run of all) {
      // Credits (14–15) and the running head (17) are the only small type.
      expect(run.size).toBeGreaterThanOrEqual(14);
      if (run.face === 'serif') expect(run.size).toBeGreaterThanOrEqual(24);
    }
  });

  test('no middle dots and no roman numerals anywhere a student reads', () => {
    for (const run of all) {
      expect(run.text).not.toContain('·');
      expect(run.text).not.toMatch(/\b(?:ii|iii|iv|vi)\.\s/);
    }
  });

  test('the running head is the lesson’s name, without its number, in grey at 17px', () => {
    const head = layoutKitV4Slide(lesson, 2).elements.find((element) => element.kind === 'text' && element.role === 'running-head');
    expect(head && head.kind === 'text' && head.y).toBe(48);
    expect(head && head.kind === 'text' && head.paras[0]!.runs[0]).toMatchObject({ text: 'Body Paragraphs', size: 17, color: KIT_V4.grey });
  });

  test('the agenda reads "Today" with its description, and numbers its items', () => {
    const runs = texts(layoutKitV4Slide(lesson, 1).elements);
    expect(runs.find((run) => run.text === 'Today')).toBeTruthy();
    expect(runs.find((run) => run.text === 'We build one paragraph together.')).toBeTruthy();
    expect(runs.find((run) => run.text === '1' && run.face === 'serif')).toBeTruthy();
    expect(runs.some((run) => run.text.includes('program'))).toBe(false);
  });

  test('a split slide puts its label in gold and its headline in white on the panel', () => {
    const runs = texts(layoutKitV4Slide(lesson, 2).elements);
    expect(runs.find((run) => run.text === 'Do')).toMatchObject({ face: 'sans', bold: true, size: 24, color: KIT_V4.gold });
    expect(runs.find((run) => run.text === 'Draft your topic sentence')).toMatchObject({ face: 'serif', color: KIT_V4.white });
  });

  test('the write slide sets its timer as a 220px numeral in the deck color', () => {
    const runs = texts(layoutKitV4Slide(lesson, 4).elements);
    expect(runs.find((run) => run.text === '5')).toMatchObject({ face: 'serif', size: 220, color: kitV4Colors(lesson)[0] });
  });

  test('the exit sends students to Yawp! in a line, not a button', () => {
    const runs = texts(layoutKitV4Slide(lesson, 8).elements);
    expect(runs.find((run) => run.text === 'Exit ticket: open it in Yawp!')).toBeTruthy();
    expect(runs.find((run) => run.text === 'Next time: Conclusions')).toBeTruthy();
  });

  test('prompt sizes by length: 68 up to 12 words, 54 up to 24, 44 up to 40, then 34', () => {
    expect(kitV4PromptSize('One two three')).toBe(68);
    expect(kitV4PromptSize(Array(20).fill('word').join(' '))).toBe(54);
    expect(kitV4PromptSize(Array(35).fill('word').join(' '))).toBe(44);
    expect(kitV4PromptSize(Array(50).fill('word').join(' '))).toBe(34);
  });
});

describe('layoutKitV4Slide: pictures', () => {
  test('the Look slide gives the painting most of the slide, with its credit', () => {
    const look = deck([slide({ layout: 'look', title: 'Look', question: 'What do you notice first?', seconds: 30 })], { art: 'hokusai-great-wave' });
    const elements = layoutKitV4Slide(look, 0).elements;
    const art = elements.find((element) => element.kind === 'art')!;
    expect(art.kind === 'art' && art.w).toBeGreaterThanOrEqual(880);
    expect(art.kind === 'art' && art.fit).toBe('contain');
    const credit = texts(elements).find((run) => run.text === 'Katsushika Hokusai');
    expect(credit).toMatchObject({ bold: true, color: KIT_V4.ink });
  });

  test('the title hangs the painting as a plain plate, credited', () => {
    const elements = layoutKitV4Slide(lesson, 0).elements;
    expect(elements.some((element) => element.kind === 'art' && element.fit === 'contain')).toBe(true);
    expect(texts(elements).some((run) => run.text === 'Katsushika Hokusai')).toBe(true);
  });

  test('never puts text over the art', () => {
    lesson.slides.forEach((_, index) => {
      const elements = layoutKitV4Slide(lesson, index).elements;
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

describe('layoutKitV4Slide: the quiz', () => {
  const quiz = deck([
    slide({ layout: 'discuss', title: 'Quiz', question: 'Which is a claim?', choices: ['The sky is blue', 'Gatsby is lonely', 'Page 4'] }),
    slide({ layout: 'discuss', title: 'Quiz', question: 'Which is a claim?', choices: ['The sky is blue', 'Gatsby is lonely', 'Page 4'], answer: 2 }),
    slide({ layout: 'discuss', title: 'Quiz', question: 'Which is evidence?', choices: ['A quote', 'A feeling'] }),
  ]);
  const plans = planKitV4Deck(quiz);

  test('labels each question "Question n of N", the answer slide keeping its number', () => {
    expect(plans.map((plan) => plan.label)).toEqual(['Question 1 of 2', 'Question 1 of 2', 'Question 2 of 2']);
    expect(plans.every((plan) => plan.template === 'quiz' && plan.panel === null)).toBe(true);
  });

  test('the answer slide bands the correct option and greys the rest', () => {
    const elements = layoutKitV4Slide(quiz, 1).elements;
    expect(elements.filter((element) => element.kind === 'rect' && element.role === 'band')).toHaveLength(1);
    const runs = texts(elements);
    expect(runs.find((run) => run.text === 'The sky is blue')!.color).toBe(KIT_V4.grey);
    expect(runs.find((run) => run.text === 'Gatsby is lonely')!.color).toBe(KIT_V4.ink);
    // The question slide itself shows no answer.
    expect(layoutKitV4Slide(quiz, 0).elements.some((element) => element.kind === 'rect')).toBe(false);
  });
});

describe('kitV4Colors', () => {
  test('the decks built so far use the kit’s own colors', () => {
    expect(kitV4Colors(deck([], { art: 'hokusai-great-wave' }))).toEqual(['#2F5873', '#1E3A5F']);
    expect(kitV4Colors(deck([], { art: 'turner-temeraire' }))).toEqual(['#294457', '#3D4A50']);
  });

  test('no terracotta, clay, brick or brown, from the deck or its painting', () => {
    expect(isEarthTone('#B75F44')).toBe(true);
    expect(isEarthTone('#9C4A22')).toBe(true);
    expect(isEarthTone('#5C4A38')).toBe(true);
    expect(isEarthTone('#A62A26')).toBe(false);
    expect(isEarthTone('#2F5873')).toBe(false);
    const colors = kitV4Colors(deck([], { colors: ['#9C4A22', '#3F5A73'] }));
    expect(colors).not.toContain('#9C4A22');
    expect(colors.length).toBeGreaterThanOrEqual(1);
  });

  test('without art, the house palette, pine first', () => {
    expect(kitV4Colors(deck([]))[0]).toBe(KIT_V4_HOUSE_PALETTE[0]);
    expect(KIT_V4_HOUSE_PALETTE).toContain('#6E1A26');
  });

  test('every deck color carries white text and reads on cream', () => {
    for (const colors of [kitV4Colors(lesson), kitV4Colors(deck([], { colors: ['#7FB3D5', '#F4D03F'] }))]) {
      for (const color of colors) {
        expect(contrastRatio(color, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(color, KIT_V4.cream)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('withDeckKit', () => {
  test('marks the deck for V4 only when the flag is on, and leaves the original alone', () => {
    const plain = deck([slide({ layout: 'title', title: 'X' })]);
    expect(withDeckKit(plain, { deckKitV4: false })).toBe(plain);
    const marked = withDeckKit(plain, { deckKitV4: true });
    expect(marked.kit).toBe('v4');
    expect(plain.kit).toBeUndefined();
  });
});
