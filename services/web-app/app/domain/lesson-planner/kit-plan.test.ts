import { describe, expect, test } from 'bun:test';
import { buildLessonPlanDoc, type LessonPlanEntry } from './lesson-plan-doc';
import { buildKitPlan, kitRuns, type KitBlock } from './kit-plan';
import { fenceSlideDeck, type SlideDeck } from './slide-deck';

const notes = { speakerNotes: 'Say it.' };

const deck: SlideDeck = {
  title: 'Lesson 5: Conclusion Paragraph',
  unit: 'The Critical Essay',
  colors: ['#9C4A22', '#3F5A73', '#7D6118'],
  art: 'turner-temeraire',
  slides: [
    { layout: 'title', title: 'Conclusion Paragraph', subtitle: 'Land the plane', ...notes },
    { layout: 'divider', title: 'We write.', processStep: 5, ...notes },
    { layout: 'write', title: 'Write', body: 'What do you carry?', step: 1, ...notes },
    { layout: 'notes', title: 'The five moves', facts: ['Restate'], step: 2, ...notes },
    { layout: 'discuss', title: 'Quiz show', question: 'Which comes first?', step: 2, ...notes },
    { layout: 'exit', title: 'Before you go', body: 'One line.', step: 3, ...notes },
  ],
};

const entries: LessonPlanEntry[] = [
  { kind: 'class-starter', title: 'Class Starter: What do you carry? (5 min)', content: 'Write about what you carry.', piece: 1 },
  { kind: 'step', title: 'Mini-lesson: the five moves (15 min)', content: 'Teach the five moves of a conclusion.', piece: 2 },
  { kind: 'exit-ticket', title: 'Exit ticket (5 min)', content: 'Write the last line of your essay.', piece: 3 },
  { kind: 'slides', title: deck.title, content: fenceSlideDeck(deck), piece: 4 },
];

function plan(withSummaries = true) {
  const doc = buildLessonPlanDoc({
    title: 'Conclusions',
    className: 'English 9',
    periodMinutes: 50,
    entries,
    summaries: withSummaries
      ? {
          overview: 'Students learn the five moves.',
          goals: ['Students will restate a thesis.', 'Write a closing line'],
          teacherWill: ['Model the five moves.'],
          steps: [
            { summary: 'They write.', purpose: 'Warms them up.', title: 'Write to start' },
            { summary: 'You teach the moves.', purpose: 'The heart.', title: 'Teach the five moves', optional: false },
            { summary: 'They write one line.', purpose: 'Shows who has it.', title: 'Close the essay' },
          ],
          closing: 'Exit ticket.',
        }
      : null,
  });
  return buildKitPlan({ doc, entries });
}

const ofType = <T extends KitBlock['type']>(blocks: KitBlock[], type: T) =>
  blocks.filter((block): block is Extract<KitBlock, { type: T }> => block.type === type);

describe('buildKitPlan: the lesson plan spec v1 data model', () => {
  test('kicker, title and subtitle match the deck; the lesson color is its primary', () => {
    const kit = plan();
    expect(kit.accent).toBe('9C4A22');
    expect(kit.kicker).toBe('YAWP! LESSON PLAN · THE CRITICAL ESSAY');
    expect(kit.title).toBe('Conclusion Paragraph');
    expect(kit.subtitle).toBe('Land the plane');
    expect(kit.footer).toBe('Conclusion Paragraph lesson plan');
  });

  test('info lines: the writing-process step, the deck and the platform', () => {
    expect(plan().meta).toEqual([
      ['Step', '5 of the writing process: conclusion'],
      ['Slide deck', 'Conclusion Paragraph'],
      ['Platform', 'yawp.school'],
    ]);
  });

  test('sections in the spec order', () => {
    const kinds = plan().body.map((block) => (block.type === 'h2' ? `h2:${block.text}` : block.type));
    expect(kinds.slice(0, 7)).toEqual(['callout', 'h2:Goals', 'twoCol', 'standards', 'h2:Materials', 'bullets', 'h2:Lesson steps']);
    const overview = plan().body[0] as Extract<KitBlock, { type: 'callout' }>;
    expect(overview.title).toBe('Overview');
  });

  test('goals: Students will… and The teacher will… side by side, without the repeated lead', () => {
    const [two] = ofType(plan().body, 'twoCol');
    expect(two!.cols[0]).toEqual(['Students will…', ['restate a thesis.', 'Write a closing line']]);
    expect(two!.cols[1]![0]).toBe('The teacher will…');
  });

  test('materials always name the deck and yawp.school', () => {
    const [materials] = ofType(plan().body, 'bullets');
    expect(materials!.items).toContain('Slide deck: Conclusion Paragraph');
    expect(materials!.items.some((item) => item.includes('yawp.school'))).toBe(true);
  });

  test('steps number straight through, with short titles, phases and their slides by name', () => {
    const body = plan().body;
    const steps = ofType(body, 'step');
    expect(steps.map((step) => step.num)).toEqual(['1', '2', '3']);
    expect(steps.map((step) => step.title)).toEqual(['Write to start', 'Teach the five moves', 'Close the essay']);
    expect(steps[1]!.slides).toBe('The five moves · Quiz show');
    expect(steps[0]!.slides).toBe('Write');
    expect(ofType(body, 'phase').map((phase) => phase.text)).toEqual(['Opening activity', 'The lesson', 'Closing']);
  });

  test('without the model’s words, the plan’s own titles and first sentences', () => {
    const steps = ofType(plan(false).body, 'step');
    expect(steps[1]!.title).toBe('Mini-lesson: the five moves');
    expect(steps[1]!.paras[0]).toContain('Teach the five moves');
  });

  test('no deck: the lesson’s own title, ember, and the class line', () => {
    const doc = buildLessonPlanDoc({ title: 'Day 3: Hooks', className: 'English 9', periodMinutes: 50, entries: entries.slice(0, 2) });
    const kit = buildKitPlan({ doc, entries: entries.slice(0, 2) });
    expect(kit.title).toBe('Hooks');
    expect(kit.kicker).toBe('YAWP! LESSON PLAN');
    expect(kit.meta[0]).toEqual(['Class', 'English 9 · 50 minutes']);
    expect(kit.accent).toMatch(/^[0-9A-F]{6}$/);
  });
});

describe('kitRuns: inline marks', () => {
  test('bold, italic and colored', () => {
    expect(kitRuns('A **bold** and *quiet* ~~2B5C8A|blue part~~.')).toEqual([
      { text: 'A ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'quiet', italic: true },
      { text: ' ' },
      { text: 'blue part', color: '2B5C8A' },
      { text: '.' },
    ]);
  });

  test('a deck color by number', () => {
    expect(kitRuns('~~2|the reason~~', ['#9C4A22', '#3F5A73'])).toEqual([{ text: 'the reason', color: '3F5A73' }]);
  });
});
