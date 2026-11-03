import { describe, expect, test } from 'bun:test';
import { planStepKey, planStepIndexForKey, readPlanSteps, readStepHeading, splitAtStepHeadings } from './plan-steps';

const PLAN = [
  '# The Things They Carried — Day 1 (50 min)',
  '',
  'Intro line.',
  '',
  '## Class starter (5 min)',
  '',
  'Students write on the prompt below.',
  '',
  '```yawp-daily-pages',
  'kind: class-starter',
  'id: FW-021',
  'What do you carry?',
  '```',
  '',
  '## Read aloud (20 min)',
  '',
  'If you like reading aloud yourself, take the first pages.',
  '',
  '### Questions to ask',
  '',
  '- What does Cross carry?',
  '',
  '## Pair talk (8 min)',
  '',
  'Pairs compare one item.',
].join('\n');

describe("readPlanSteps (Brian's run 2, A3)", () => {
  test('one step per ## heading, with its minutes and its own text', () => {
    const steps = readPlanSteps(PLAN);
    expect(steps.map((step) => step.title)).toEqual(['Class starter', 'Read aloud', 'Pair talk']);
    expect(steps.map((step) => step.minutes)).toEqual([5, 20, 8]);
    expect(steps.map((step) => step.key)).toEqual(['st', 'st:1', 'st:2']);
    expect(steps[1]!.content).toContain('If you like reading aloud yourself');
    // Sub-headings belong to their step.
    expect(steps[1]!.content).toContain('### Questions to ask');
    expect(steps[1]!.content).toContain('What does Cross carry?');
  });

  test("a step's blocks are pieces of their own, not part of its text", () => {
    const [starter] = readPlanSteps(PLAN);
    expect(starter!.content).toBe('Students write on the prompt below.');
    expect(starter!.content).not.toContain('yawp-daily-pages');
  });

  test('a plan written in bold, timed steps', () => {
    const steps = readPlanSteps(
      '**Class starter (5 min)** — write about what you carry.\n\n**Read aloud** (20 min): the first pages.\nAsk who carries what.\n\n**Pair talk (8 min)**\nCompare.'
    );
    expect(steps.map((step) => step.title)).toEqual(['Class starter', 'Read aloud', 'Pair talk']);
    expect(steps[1]!.content).toContain('Ask who carries what.');
  });

  test('a reply that is not a plan has no steps', () => {
    expect(readPlanSteps('Which class is this for?')).toEqual([]);
    expect(readPlanSteps('## Only one heading (5 min)\n\nText.')).toEqual([]);
  });

  test('keys fit the packet API and round-trip', () => {
    expect(planStepKey(0)).toBe('st');
    expect(planStepKey(12)).toBe('st:12');
    expect(planStepKey(99).length).toBeLessThanOrEqual(8);
    expect(planStepIndexForKey('st')).toBe(0);
    expect(planStepIndexForKey('st:3')).toBe(3);
    expect(planStepIndexForKey('dp:3')).toBeNull();
  });
});

describe("readPlanSteps — a step holds only its own content (Brian's run 3, item 5)", () => {
  const REPLY = [
    '## Hook: What’s in your bag? (15 min)',
    '',
    'Students lay out what is in their bag.',
    '',
    '## Closing (3 min)',
    '',
    'Exit ticket: one object, one sentence.',
    '',
    'Total: 15 + 5 + 10 + 12 + 5 + 3 = 50 minutes',
    '',
    'You don’t have to use all of these. Pick one framing card or all three.',
    '',
    'Want to refine or edit any part of this?',
  ].join('\n');

  test('the last step stops before the total, the invite and the question', () => {
    const closing = readPlanSteps(REPLY).at(-1)!;
    expect(closing.content).toBe('Exit ticket: one object, one sentence.');
  });

  test('a rule after the last step ends it', () => {
    const steps = readPlanSteps(
      '## Warm-up (5 min)\n\nWrite.\n\n## Closing (5 min)\n\nShare one line.\n\n---\n\nThat should fill the period nicely.'
    );
    expect(steps.at(-1)!.content).toBe('Share one line.');
  });

  test('a question inside a step that is not the end stays', () => {
    const steps = readPlanSteps(
      '## Discussion (10 min)\n\nAsk: What would you carry?\n\nThen pairs share.\n\n## Closing (5 min)\n\nShare.'
    );
    expect(steps[0]!.content).toContain('What would you carry?');
  });

  test('bold steps stop the same way', () => {
    const steps = readPlanSteps(
      '**Warm-up (5 min)** Write.\n\n**Closing (5 min)** Share one line.\n\nTotal: 5 + 5 = 10 minutes\n\nWould you like me to make a handout?'
    );
    expect(steps.at(-1)!.content).toBe('Share one line.');
  });
});

describe("splitAtStepHeadings (Brian's run 3, item 1)", () => {
  test('cuts prose at each step heading, in order, across parts', () => {
    const steps = readPlanSteps(PLAN);
    const first = splitAtStepHeadings('Intro line.\n\n## Class starter (5 min)\n\nStudents write.', steps, 0);
    expect(first.chunks.map((chunk) => chunk.kind)).toEqual(['markdown', 'step', 'markdown']);
    expect(first.chunks[1]).toMatchObject({ index: 0, heading: '## Class starter (5 min)' });
    expect(first.next).toBe(1);
    const second = splitAtStepHeadings('## Read aloud (20 min)\n\nRead.\n\n### Questions to ask', steps, first.next);
    expect(second.chunks[0]).toMatchObject({ kind: 'step', index: 1 });
    // A sub-heading is not a step.
    expect(second.chunks.at(-1)).toMatchObject({ kind: 'markdown' });
    expect(second.next).toBe(2);
  });

  test('the type tag never shows', () => {
    const steps = readPlanSteps('## Hook (15 min) {type: activity}\n\nGo.\n\n## Close (5 min)\n\nEnd.');
    expect(steps[0]!.stepType).toBe('activity');
    const { chunks } = splitAtStepHeadings('## Hook (15 min) {type: activity}\n\nGo.', steps, 0);
    expect(chunks[0]).toMatchObject({ kind: 'step', heading: '## Hook (15 min)' });
  });
});

describe('readStepHeading', () => {
  test('title, minutes and level, with the type tag and bold gone', () => {
    expect(readStepHeading('## Hook activity: What’s in your bag? (15 min)')).toEqual({
      level: 2,
      title: 'Hook activity: What’s in your bag?',
      minutes: 15,
    });
    expect(readStepHeading('### **Framing** — 10 minutes {type: context}')).toEqual({
      level: 3,
      title: 'Framing',
      minutes: 10,
    });
    expect(readStepHeading('## Closing')).toEqual({ level: 2, title: 'Closing', minutes: null });
  });
});

describe("steps written as a table or a list keep their minutes (Brian's run 5, round 2)", () => {
  test('a table with a time column: each row is a step', () => {
    const table = [
      '# Day 1: The Brian Connell Show',
      '',
      '| Time | Segment | What happens |',
      '| --- | --- | --- |',
      '| 5 min | **Opening hook** | One sentence: when do rules matter? |',
      '| 25 min | Mini-lecture | Civilization vs. savagery, symbolism, allegory |',
      '| 10 min | Guided note-check | Pairs compare notes |',
      '| 5 min | Read aloud | The conch scene |',
      '| 5 | Transitions | |',
    ].join('\n');
    const steps = readPlanSteps(table);
    expect(steps.map((step) => [step.title, step.minutes])).toEqual([
      ['Opening hook', 5],
      ['Mini-lecture', 25],
      ['Guided note-check', 10],
      ['Read aloud', 5],
      ['Transitions', 5],
    ]);
    expect(steps[1]!.content).toContain('symbolism');
  });

  test('a numbered list with minutes: each item is a step', () => {
    const list = ['1. Opening hook (5 min): one sentence on rules.', '2. Mini-lecture (25 min): the war behind the book.', '3. Note-check (10 min) — pairs.'].join('\n');
    expect(readPlanSteps(list).map((step) => [step.title, step.minutes])).toEqual([
      ['Opening hook', 5],
      ['Mini-lecture', 25],
      ['Note-check', 10],
    ]);
  });

  test('a table with no time column, or a list without minutes, is not a plan', () => {
    expect(readPlanSteps('| Word | Meaning |\n| --- | --- |\n| conch | shell |\n| littlun | small boy |')).toEqual([]);
    expect(readPlanSteps('1. Read.\n2. Talk.')).toEqual([]);
  });
});
