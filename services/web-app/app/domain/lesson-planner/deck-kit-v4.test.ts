import { describe, expect, test } from 'bun:test';
import {
  KIT_V4,
  KIT_V4_HOUSE_PALETTE,
  findHighlights,
  isEarthTone,
  kitV4HighlightColors,
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

describe('layoutKitV4Slide: a diagram of how a text is built (Nov 22)', () => {
  type Rect = Extract<KitV4Element, { kind: 'rect' }>;
  type Text = Extract<KitV4Element, { kind: 'text' }>;
  type Item = { label: string; text?: string; note?: string; weight?: number };
  const SONNET: Item[] = [
    { label: 'Quatrain 1', text: 'Autumn: a few yellow leaves', note: 'lines 1–4', weight: 4 },
    { label: 'Quatrain 2', text: 'Twilight fading into night', note: 'lines 5–8', weight: 4 },
    { label: 'Quatrain 3', text: 'A fire dying on its own ashes', note: 'lines 9–12', weight: 4 },
    { label: 'Couplet', text: 'So love well what you must leave', note: 'lines 13–14', weight: 2 },
  ];
  const FRAMES: Item[] = [
    { label: 'Walton’s letters', text: 'A sea captain writes home to his sister from the Arctic.' },
    { label: 'Victor’s story', text: 'The man Walton rescues tells how he made a living being, and ran from it.' },
    { label: 'The creature’s story', text: 'At the centre, the creature tells Victor how he learned to speak and to want.' },
  ];
  const YOUNGERS: Item[] = [
    { label: 'Lena (Mama)', text: 'A house with a garden', note: 'Head of the family' },
    { label: 'Walter Lee', text: 'A liquor store of his own', note: 'Lena’s son' },
    { label: 'Beneatha', text: 'Medical school', note: 'Lena’s daughter' },
    { label: 'Ruth', text: 'A home that is theirs', note: 'Walter’s wife' },
    { label: 'Travis', text: 'Fifty cents for school', note: 'Walter and Ruth’s son' },
    { label: 'George Murchison', text: 'Beneatha, and no talk of ideas', note: 'Beneatha’s suitor' },
  ];
  const diagram = (kind: 'parts' | 'frames' | 'cast', items: Item[], kit: 'v4' | 'v4.1' = 'v4.1', body?: string) =>
    layoutKitV4Slide(deck([slide({ layout: 'diagram', title: 'How it is built', body, diagram: { kind, items } })], { kit }), 0);
  const blocks = (elements: KitV4Element[]) => elements.filter((element): element is Rect => element.kind === 'rect');
  const boxes = (elements: KitV4Element[]) => elements.filter((element): element is Text => element.kind === 'text');
  const said = (elements: KitV4Element[]) => texts(elements).map((run) => run.text.trim());
  /** A text box's words fit its box, by the layout's own measure: a letter about half its size wide. */
  const fits = (box: Text) => {
    const height = box.paras.reduce((sum, para) => {
      const size = Math.max(...para.runs.map((run) => run.size));
      const letters = para.runs.reduce((count, run) => count + run.text.length, 0);
      return sum + Math.ceil((letters * size * 0.5) / box.w) * size * (para.leading ?? 1.35) + (para.after ?? 0);
    }, 0);
    return height <= box.h + 40;
  };

  const cases: Array<[string, 'parts' | 'frames' | 'cast', Item[]]> = [
    ['a sonnet’s parts', 'parts', SONNET],
    ['a frame narrative', 'frames', FRAMES],
    ['a family', 'cast', YOUNGERS.slice(0, 4)],
    ['six cards', 'cast', YOUNGERS],
    ['six frames', 'frames', [...FRAMES, ...YOUNGERS.slice(0, 3)]],
    ['six parts', 'parts', YOUNGERS],
  ];
  for (const [name, kind, items] of cases) {
    for (const kit of ['v4', 'v4.1'] as const) {
      test(`${name} (spec ${kit}): boxes and words only, inside the slide, no words wider than their box`, () => {
        const layout = diagram(kind, items, kit, 'Where does it turn?');
        expect(layout.template).toBe('diagram');
        expect(layout.background).toBe(KIT_V4.cream);
        expect(layout.elements.every((element) => element.kind === 'rect' || element.kind === 'text')).toBe(true);
        expect(blocks(layout.elements).length).toBeGreaterThanOrEqual(2);
        for (const element of layout.elements) {
          expect(element.x).toBeGreaterThanOrEqual(0);
          expect(element.y).toBeGreaterThanOrEqual(0);
          expect(element.x + element.w).toBeLessThanOrEqual(1280);
          expect(element.y + element.h).toBeLessThanOrEqual(720);
          expect(element.w).toBeGreaterThan(0);
          expect(element.h).toBeGreaterThan(0);
        }
        // Under the headline, every box of words sits within the width of a block of the diagram.
        const top = Math.min(...blocks(layout.elements).map((block) => block.y));
        for (const box of boxes(layout.elements).filter((element) => element.y >= top)) {
          expect(blocks(layout.elements).some((block) => box.x >= block.x - 0.5 && box.x + box.w <= block.x + block.w + 0.5)).toBe(true);
          expect(fits(box)).toBe(true);
        }
        // Every item is on the slide by name.
        for (const item of items.slice(0, 4)) expect(said(layout.elements).join(' ')).toContain(item.label);
        for (const run of texts(layout.elements)) expect(run.size).toBeGreaterThanOrEqual(15);
      });
    }
  }

  test('the headline and its one line sit above the diagram; spec v4 keeps its running head', () => {
    const layout = diagram('parts', SONNET, 'v4', 'Where does the poem turn?');
    expect(texts(layout.elements).find((run) => run.text === 'How it is built')?.source).toMatchObject({ field: 'title' });
    expect(texts(layout.elements).find((run) => run.text === 'Where does the poem turn?')?.source).toMatchObject({ field: 'body' });
    expect(layout.elements.some((element) => element.kind === 'text' && element.role === 'running-head')).toBe(true);
    const headline = boxes(layout.elements).find((box) => box.paras.some((para) => para.runs.some((run) => run.text === 'How it is built')))!;
    expect(headline.y + headline.h).toBeLessThanOrEqual(Math.min(...blocks(layout.elements).map((block) => block.y)));
    expect(diagram('parts', SONNET, 'v4.1').elements.some((element) => element.kind === 'text' && element.role === 'running-head')).toBe(false);
  });

  test('parts: each block is as wide as its share, in the deck’s colors in turn, its name in white inside it', () => {
    const layout = diagram('parts', SONNET);
    const strip = blocks(layout.elements);
    expect(strip).toHaveLength(4);
    // The couplet is two lines to a quatrain's four.
    expect(strip[3]!.w / strip[0]!.w).toBeCloseTo(0.5, 2);
    expect(strip[0]!.w).toBeCloseTo(strip[1]!.w, 5);
    expect(new Set(strip.map((block) => block.y)).size).toBe(1);
    // Side by side with a small gap, across the slide's width.
    strip.slice(1).forEach((block, i) => expect(block.x - (strip[i]!.x + strip[i]!.w)).toBeCloseTo(8, 5));
    expect(strip[0]!.x).toBe(80);
    expect(strip[3]!.x + strip[3]!.w).toBeCloseTo(1200, 5);
    const colors = kitV4Colors(deck([]));
    expect(strip.map((block) => block.fill)).toEqual([colors[0]!, colors[1]!, colors[0]!, colors[1]!]);
    const name = texts(layout.elements).find((run) => run.text === 'Couplet')!;
    expect(name).toMatchObject({ color: KIT_V4.white, bold: true, face: 'sans' });
    expect(texts(layout.elements).find((run) => run.text === 'So love well what you must leave')).toMatchObject({ color: KIT_V4.ink });
    expect(texts(layout.elements).find((run) => run.text === 'lines 13–14')).toMatchObject({ color: KIT_V4.grey });
    // Each part's words are under its own block.
    const under = boxes(layout.elements).find((box) => box.paras.some((para) => para.runs.some((run) => run.text === 'lines 13–14')))!;
    expect(under.x).toBeCloseTo(strip[3]!.x, 5);
    expect(under.w).toBeCloseTo(strip[3]!.w, 5);
    expect(under.y).toBeGreaterThan(strip[3]!.y + strip[3]!.h);
  });

  test('parts with no sizes are equal', () => {
    const strip = blocks(diagram('parts', FRAMES).elements);
    expect(strip[0]!.w).toBeCloseTo(strip[2]!.w, 5);
  });

  test('parts: a block too narrow to read under gets a number, and the words a numbered list below', () => {
    const speech = [
      { label: 'The question', text: 'To be, or not to be', weight: 5 },
      { label: 'Death as sleep', text: 'To die, to sleep, no more', weight: 9 },
      { label: 'The rub', text: 'What dreams may come', weight: 18 },
      { label: 'Back to himself', text: 'Soft you now', weight: 1 },
    ];
    const layout = diagram('parts', speech);
    const strip = blocks(layout.elements).filter((block) => block.h === 64);
    expect(strip).toHaveLength(4);
    expect(strip[3]!.w).toBeLessThan(150);
    expect(strip[3]!.w).toBeGreaterThanOrEqual(36);
    // The strip carries numbers; every name and sentence is in the list, beside its number's color.
    expect(said(layout.elements).filter((text) => /^[1-4]$/.test(text))).toHaveLength(8);
    for (const item of speech) {
      expect(said(layout.elements)).toContain(item.label);
      expect(said(layout.elements)).toContain(item.text);
    }
    const name = texts(layout.elements).find((run) => run.text === 'The rub')!;
    expect(name.color).toBe(strip[2]!.fill);
  });

  test('parts: a name too long for its block goes under it, with a number in the block, and no word is broken', () => {
    const layout = diagram('parts', [{ label: 'Counterargument and rebuttal', text: 'The other side' }, { label: 'Claim' }, { label: 'Evidence' }, { label: 'Reasoning' }, { label: 'Conclusion' }, { label: 'Hook' }]);
    const name = texts(layout.elements).find((run) => run.text === 'Counterargument and rebuttal')!;
    const strip = blocks(layout.elements);
    expect(name.color).toBe(strip[0]!.fill);
    expect(said(layout.elements)).toContain('6');
    // "Counterargument" on one line of its block, by the layout's measure of Arial Bold.
    expect('Counterargument'.length * name.size * 0.58).toBeLessThanOrEqual(strip[0]!.w);
    // The sentence under a name is never much larger than the name.
    expect(texts(layout.elements).find((run) => run.text === 'The other side')!.size).toBeLessThanOrEqual(name.size + 2);
  });

  test('frames: each inside the one before, the outermost first, its name in its frame’s color', () => {
    const layout = diagram('frames', FRAMES);
    // A frame is a colored box with a cream one a little smaller over it.
    const frames = blocks(layout.elements).filter((block) => block.fill !== KIT_V4.cream);
    const insides = blocks(layout.elements).filter((block) => block.fill === KIT_V4.cream);
    expect(frames).toHaveLength(3);
    expect(insides).toHaveLength(3);
    frames.slice(1).forEach((frame, i) => {
      const outer = frames[i]!;
      expect(frame.x).toBeGreaterThan(outer.x);
      expect(frame.y).toBeGreaterThan(outer.y);
      expect(frame.x + frame.w).toBeLessThan(outer.x + outer.w);
      expect(frame.y + frame.h).toBeLessThan(outer.y + outer.h);
    });
    frames.forEach((frame, i) => {
      expect(insides[i]!.w).toBeLessThan(frame.w);
      expect(insides[i]!.w).toBeGreaterThan(frame.w - 20);
      const name = texts(layout.elements).find((run) => run.text === FRAMES[i]!.label)!;
      expect(name).toMatchObject({ bold: true, color: frame.fill });
      // The outer frame's name is above the frame inside it, so it stays readable.
      const box = boxes(layout.elements).find((element) => element.paras.some((para) => para.runs.includes(name)))!;
      expect(box.y).toBeGreaterThan(frame.y);
      if (frames[i + 1]) expect(box.y + box.h).toBeLessThanOrEqual(frames[i + 1]!.y);
    });
  });

  test('frames: four are drawn, and a fifth and sixth are lines in the innermost', () => {
    const layout = diagram('frames', [...FRAMES, ...YOUNGERS.slice(0, 3)]);
    expect(blocks(layout.elements).filter((block) => block.fill !== KIT_V4.cream)).toHaveLength(4);
    const innermost = boxes(layout.elements).at(-1)!;
    const lines = innermost.paras.map((para) => para.runs.map((run) => run.text).join('').trim());
    expect(lines.join(' | ')).toContain('Lena (Mama)');
    expect(lines).toContain('Walter Lee: A liquor store of his own');
    expect(lines).toContain('Beneatha: Medical school');
  });

  test('a cast: two and three in a row, four in two rows of two, five and six in rows of three', () => {
    const cards = (n: number) => {
      const all = blocks(diagram('cast', YOUNGERS.slice(0, n)).elements);
      // Each card is its body and, over it, its band.
      expect(all).toHaveLength(n * 2);
      const bodies = all.filter((_, i) => i % 2 === 0);
      return { columns: new Set(bodies.map((card) => Math.round(card.x))).size, rows: new Set(bodies.map((card) => Math.round(card.y))).size };
    };
    expect(cards(2)).toEqual({ columns: 2, rows: 1 });
    expect(cards(3)).toEqual({ columns: 3, rows: 1 });
    expect(cards(4)).toEqual({ columns: 2, rows: 2 });
    expect(cards(5)).toEqual({ columns: 3, rows: 2 });
    expect(cards(6)).toEqual({ columns: 3, rows: 2 });
  });

  test('a cast: the name in white on a band of the deck color, then what they want in ink and who they are in grey', () => {
    const layout = diagram('cast', YOUNGERS.slice(0, 4));
    const [body, band] = blocks(layout.elements);
    expect(band!.fill).toBe(kitV4Colors(deck([]))[0]!);
    expect(band!.y).toBe(body!.y);
    expect(band!.w).toBe(body!.w);
    expect(band!.h).toBeLessThan(body!.h / 2);
    // Every card has the same band: the color here says "a person", not which one.
    expect(new Set(blocks(layout.elements).filter((_, i) => i % 2 === 1).map((block) => block.fill)).size).toBe(1);
    const name = texts(layout.elements).find((run) => run.text === 'Walter Lee')!;
    expect(name).toMatchObject({ color: KIT_V4.white, bold: true });
    expect(contrastRatio(KIT_V4.white, band!.fill)).toBeGreaterThanOrEqual(4.5);
    expect(texts(layout.elements).find((run) => run.text === 'A liquor store of his own')).toMatchObject({ color: KIT_V4.ink });
    const note = texts(layout.elements).find((run) => run.text === 'Lena’s son')!;
    expect(note.color).toBe(KIT_V4.grey);
    expect(note.size).toBeLessThan(texts(layout.elements).find((run) => run.text === 'A liquor store of his own')!.size);
    // A white card on the cream slide.
    expect(body!.fill).toBe(KIT_V4.white);
  });

  test('words that cannot fit are cut with an ellipsis, and a cut run is not typed on the slide', () => {
    const long = 'What each of them wants from the insurance check, and why it cannot be shared out between the four of them at all.';
    const layout = diagram('cast', YOUNGERS.map((person) => ({ ...person, text: long.slice(0, 120), note: 'A relation described at some length, for the test.' })), 'v4', 'Who wants what, and who is in the way of it?');
    const cut = texts(layout.elements).filter((run) => run.text.endsWith('…'));
    expect(cut.length).toBeGreaterThan(0);
    for (const run of cut) expect(run.source).toBeUndefined();
    for (const box of boxes(layout.elements)) expect(fits(box)).toBe(true);
  });

  test('a diagram slide with no diagram left in it still draws its title', () => {
    const layout = layoutKitV4Slide(deck([slide({ layout: 'diagram', title: 'How it is built' })]), 0);
    expect(texts(layout.elements).some((run) => run.text === 'How it is built')).toBe(true);
  });
});

describe('layoutKitV4Slide: the phrases an excerpt marks (Nov 22)', () => {
  const passage = 'That time of year thou mayst in me behold\nWhen yellow leaves, or none, or few, do hang\nUpon those boughs which shake against the cold,\nBare ruin’d choirs, where late the sweet birds sang.';
  const excerpt = (highlight?: string[], kit: 'v4' | 'v4.1' = 'v4.1') =>
    deck(
      [
        slide({
          layout: 'excerpt',
          title: 'Annotate',
          body: passage,
          author: 'William Shakespeare',
          work: 'Sonnet 73',
          highlight,
          tasks: [{ verb: 'Circle', text: 'the season' }, { verb: 'Underline', text: 'what is left of summer' }, { verb: 'Star', text: 'the sound of the last line' }],
        }),
      ],
      { kit }
    );
  const runsOf = (of: SlideDeck) => texts(layoutKitV4Slide(of, 0).elements);
  /** The passage's column: the one box set in Georgia. Its last paragraph is the credit line. */
  const lines = (of: SlideDeck) => {
    const column = layoutKitV4Slide(of, 0).elements.find((element) => element.kind === 'text' && element.paras.some((para) => para.runs.some((run) => run.face === 'serif')))!;
    return column.kind === 'text' ? column.paras.slice(0, -1) : [];
  };
  /** The marked words: Arial Bold among the passage's Georgia. */
  const colored = (of: SlideDeck) => lines(of).flatMap((para) => para.runs.filter((run) => run.face === 'sans'));

  test('each phrase is drawn bold in its own color, and the passage keeps every word and line break', () => {
    const of = excerpt(['yellow leaves', 'Bare ruin’d choirs']);
    const marked = colored(of);
    expect(marked.map((run) => run.text)).toEqual(['yellow leaves', 'Bare ruin’d choirs']);
    const tones = kitV4HighlightColors(kitV4Colors(of));
    expect(marked.map((run) => run.color)).toEqual([tones[0]!, tones[1]!]);
    expect(tones[0]).not.toBe(tones[1]);
    for (const run of marked) {
      expect(run.bold).toBe(true);
      expect(contrastRatio(run.color, KIT_V4.cream)).toBeGreaterThanOrEqual(4.5);
      // It stands apart from the ink around it, which a deck color as dark as pine does not.
      expect(contrastRatio(run.color, KIT_V4.ink)).toBeGreaterThanOrEqual(2.5);
    }
    // A line of verse to a paragraph, each as printed.
    expect(lines(of).map((para) => para.runs.map((run) => run.text).join(''))).toEqual(passage.split('\n'));
    // The passage's Georgia at the size it has unmarked; the marked words a little smaller, to the same height.
    const plain = runsOf(excerpt()).find((run) => run.text === passage)!;
    const rest = lines(of).flatMap((para) => para.runs.filter((run) => run.face === 'serif'));
    expect(new Set(rest.map((run) => run.size))).toEqual(new Set([plain.size]));
    expect(rest.every((run) => run.color === KIT_V4.ink && !run.bold)).toBe(true);
    expect(marked[0]!.size).toBe(Math.round(plain.size * 0.92));
  });

  test('a phrase not in the passage is ignored, and the others keep their own colors', () => {
    const of = excerpt(['green leaves', 'the cold']);
    const marked = colored(of);
    expect(marked.map((run) => run.text)).toEqual(['the cold']);
    expect(marked[0]!.color).toBe(kitV4HighlightColors(kitV4Colors(of))[1]!);
  });

  test('case, straight or curly quotes and a line break in the phrase are not held against it', () => {
    expect(colored(excerpt(["bare ruin'd CHOIRS"])).map((run) => run.text)).toEqual(['Bare ruin’d choirs']);
    // Across a line break, the phrase is marked on both lines.
    expect(colored(excerpt(['behold When yellow'])).map((run) => run.text)).toEqual(['behold', 'When yellow']);
    expect(colored(excerpt(['the cold.'])).map((run) => run.text)).toEqual(['the cold']);
  });

  test('a blank line between stanzas is kept as a line’s space', () => {
    const stanzas = deck([slide({ layout: 'excerpt', title: 'Annotate', body: 'Hope is the thing with feathers\nThat perches in the soul,\n\nAnd sweetest in the gale is heard;', author: 'Emily Dickinson', highlight: ['the thing with feathers'] })], { kit: 'v4.1' });
    const [first, second, third] = lines(stanzas);
    expect(lines(stanzas)).toHaveLength(3);
    expect(first!.after ?? 0).toBe(0);
    expect(second!.after).toBeGreaterThan(second!.runs[0]!.size);
    expect(third!.runs[0]!.text).toBe('And sweetest in the gale is heard;');
  });

  test('first place only, whole words before part of one, and never over a phrase already marked', () => {
    expect(findHighlights('the heart of the art', ['art'])).toEqual([{ start: 17, end: 20, phrase: 0 }]);
    expect(findHighlights('or none, or few', ['or'])).toEqual([{ start: 0, end: 2, phrase: 0 }]);
    expect(findHighlights(passage, ['yellow leaves', 'leaves, or none']).map((mark) => mark.phrase)).toEqual([0]);
    expect(findHighlights(passage, [])).toEqual([]);
  });

  test('the task for each marked phrase carries a dot in its color, one that shows on the panel', () => {
    const of = excerpt(['yellow leaves', 'no such words', 'sweet birds sang']);
    const layout = layoutKitV4Slide(of, 0);
    const panel = layout.elements.find((element) => element.kind === 'rect' && element.role === 'panel')!;
    const tasks = layout.elements.find((element) => element.kind === 'text' && element.paras.some((para) => para.runs.some((run) => run.text === 'Circle ')))!;
    const rows = tasks.kind === 'text' ? tasks.paras.filter((para) => para.runs.some((run) => run.source?.field === 'tasks')) : [];
    expect(rows.map((para) => para.runs[0]!.text)).toEqual(['● ', 'Underline ', '● ']);
    const dots = rows.flatMap((para) => para.runs.filter((run) => run.text === '● '));
    expect(new Set(dots.map((dot) => dot.color)).size).toBe(2);
    for (const dot of dots) {
      expect(dot.source).toBeUndefined();
      expect(panel.kind === 'rect' && contrastRatio(dot.color, panel.fill)).toBeGreaterThanOrEqual(3);
    }
    // The verb is still typed on the slide, as before.
    expect(rows[0]!.runs[1]).toMatchObject({ text: 'Circle ', source: { field: 'tasks', index: 0, key: 'verb' } });
  });

  test('marked, the passage is not typed on the slide; unmarked, it is as it always was', () => {
    expect(runsOf(excerpt(['yellow leaves'])).some((run) => run.source?.field === 'body')).toBe(false);
    for (const of of [excerpt(), excerpt(['no such words'])]) {
      const run = runsOf(of).find((r) => r.text === passage)!;
      expect(run).toMatchObject({ face: 'serif', color: KIT_V4.ink, source: { field: 'body' } });
      expect(runsOf(of).some((r) => r.text === '● ')).toBe(false);
    }
  });

  test('three phrases on a two-color deck are three colors, and two blues of one deck are not two of them', () => {
    const tones = kitV4HighlightColors(kitV4Colors(deck([])));
    expect(new Set(tones.slice(0, 3)).size).toBe(3);
    for (const tone of tones) expect(contrastRatio(tone, KIT_V4.cream)).toBeGreaterThanOrEqual(4.5);
    // The Great Wave's deck colors are two blues: the second phrase takes another hue.
    const wave = kitV4Colors(deck([], { art: 'hokusai-great-wave' }));
    const marked = kitV4HighlightColors(wave);
    const hueOf = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number];
      const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
      const h = max === r ? ((g - b) / (max - min) + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / (max - min) + 2) * 60 : ((r - g) / (max - min) + 4) * 60;
      return h;
    };
    const apart = Math.abs(hueOf(marked[0]!) - hueOf(marked[1]!));
    expect(Math.min(apart, 360 - apart)).toBeGreaterThanOrEqual(25);
  });
});

describe('layoutKitV4Slide: the lesson’s own picture on the title slide (Nov 22)', () => {
  const title = (extra: Partial<SlideDeck> = {}, image: string | null = 'cmh0dustbowl0000abcd') =>
    layoutKitV4Slide(deck([slide({ layout: 'title', title: 'The Grapes of Wrath', subtitle: 'Chapter 1', ...(image ? { image } : {}) })], extra), 0).elements;

  for (const kit of ['v4', 'v4.1'] as const) {
    test(`spec ${kit}: the picture hangs where the painting would, and the title keeps to its side`, () => {
      const elements = title({ kit });
      const picture = elements.find((element) => element.kind === 'picture')!;
      expect(picture).toMatchObject({ kind: 'picture', id: 'cmh0dustbowl0000abcd', x: 680, w: 520 });
      const painted = title({ kit, art: 'hokusai-great-wave' }, null).find((element) => element.kind === 'art')!;
      expect({ x: picture.x, y: picture.y, w: picture.w, h: picture.h }).toEqual({ x: painted.x, y: painted.y, w: painted.w, h: painted.h });
      for (const text of elements.filter((element) => element.kind === 'text')) expect(text.x + text.w).toBeLessThanOrEqual(640);
    });

    test(`spec ${kit}: a picture wins over the painting, and takes its credit with it`, () => {
      const elements = title({ kit, art: 'hokusai-great-wave' });
      expect(elements.filter((element) => element.kind === 'picture')).toHaveLength(1);
      expect(elements.some((element) => element.kind === 'art')).toBe(false);
      expect(texts(elements).some((run) => run.text === 'Katsushika Hokusai')).toBe(false);
    });
  }

  test('with no picture the title is as it was: the painting, or the full width', () => {
    expect(title({ kit: 'v4.1', art: 'hokusai-great-wave' }, null).some((element) => element.kind === 'art')).toBe(true);
    const plain = title({ kit: 'v4.1' }, null);
    expect(plain.some((element) => element.kind === 'picture' || element.kind === 'art')).toBe(false);
    expect(Math.max(...plain.map((element) => element.x + element.w))).toBe(1200);
  });
});
