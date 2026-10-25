import { describe, expect, test } from 'bun:test';
import {
  buildLessonPlanDoc,
  planSummaryKey,
  type LessonPlanEntry,
} from './lesson-plan-doc';

const DECK_FENCE =
  '```yawp-slides\n' +
  JSON.stringify({
    title: 'The Things They Carried — Day 1',
    slides: [
      { layout: 'title', title: 'Day 1', speakerNotes: 'Go.' },
      { layout: 'prompt', title: 'Starter', body: 'Write.', speakerNotes: 'Go.' },
    ],
  }) +
  '\n```';

const ENTRIES: LessonPlanEntry[] = [
  { kind: 'class-starter', title: 'Class Starter: What do you carry?', content: 'What do you carry every day that no one sees? Write for a while.' },
  { kind: 'notes', title: 'Historical context', content: 'Vietnam, 1969–70. O’Brien was drafted. Long framing text '.repeat(20) },
  { kind: 'notes', title: 'Literary context', content: 'Metafiction: a story about stories. '.repeat(20) },
  { kind: 'step', title: 'Read aloud (20 min)', content: 'If you like reading aloud yourself, take the first pages. Ask who carries what.' },
  { kind: 'handout', title: 'Inventory chart', content: '| Item | Who | Why |\n|---|---|---|' },
  { kind: 'exit-ticket', title: 'Exit ticket', content: 'What did Cross carry that weighed nothing?' },
  { kind: 'slides', title: 'The Things They Carried — Day 1', content: DECK_FENCE },
];

describe("buildLessonPlanDoc (Brian's run 2, D1)", () => {
  const doc = buildLessonPlanDoc({
    title: 'The Things They Carried — Day 1',
    className: 'English 11 · Period 5',
    periodMinutes: 50,
    entries: ENTRIES,
  });

  test('one numbered instruction per moment of the lesson, in stack order', () => {
    // The exit ticket is the Closing section, not a sixth instruction
    // (Brian's run 3, item 12).
    expect(doc.instructions.map((step) => step.title)).toEqual([
      'Class starter',
      'Historical context',
      'Literary context',
      'Read aloud',
      'Inventory chart',
    ]);
    expect(doc.closingStep?.title).toBe('Exit ticket');
    expect(doc.instructions[3]!.minutes).toBe(20);
  });

  test('a short summary, never the full text of a framing or prompt', () => {
    for (const step of doc.instructions) {
      expect(step.summary.length).toBeLessThanOrEqual(220);
    }
    expect(doc.instructions[1]!.summary).not.toContain('Long framing text Long framing text');
  });

  test('says what each writing piece is for', () => {
    expect(doc.instructions[0]!.purpose).toContain('writing');
    expect(doc.closingStep!.purpose).toContain('before they leave');
  });

  test('materials by name only, the deck among them', () => {
    expect(doc.materials).toEqual([
      'Class starter (Yawp! assignment): What do you carry?',
      'Inventory chart (handout)',
      'Exit ticket (Yawp! assignment)',
      'Slide deck: The Things They Carried — Day 1 (2 slides)',
    ]);
  });

  test('overview, goals and a closing a teacher can add to', () => {
    expect(doc.overview).toContain('50-minute');
    expect(doc.overview).toContain('English 11 · Period 5');
    expect(doc.goals.length).toBeGreaterThan(0);
    expect(doc.closing).toContain('What did Cross carry');
  });

  test('the model\'s summaries win when they line up with the steps', () => {
    const summarized = buildLessonPlanDoc({
      title: 'Day 1',
      className: null,
      periodMinutes: 50,
      entries: ENTRIES,
      summaries: {
        overview: 'Students enter the book through what soldiers carried.',
        goals: ['Students will name what an object reveals about a character.'],
        teacherWill: ['Read the opening aloud.'],
        steps: ENTRIES.slice(0, 6).map((_, index) => ({
          summary: `Summary ${index}`,
          purpose: `Purpose ${index}`,
        })),
        closing: 'Collect the exit tickets at the door.',
      },
    });
    expect(summarized.overview).toBe('Students enter the book through what soldiers carried.');
    expect(summarized.instructions[2]).toMatchObject({ summary: 'Summary 2', purpose: 'Purpose 2' });
    expect(summarized.teacherWill).toEqual(['Read the opening aloud.']);
  });

  test('summaries for a different stack are ignored', () => {
    const mismatched = buildLessonPlanDoc({
      title: 'Day 1',
      className: null,
      periodMinutes: 50,
      entries: ENTRIES,
      summaries: { steps: [{ summary: 'only one', purpose: 'x' }] },
    });
    expect(mismatched.instructions[0]!.summary).not.toBe('only one');
  });

  test('a kept whole reply becomes its own steps', () => {
    const fromReply = buildLessonPlanDoc({
      title: 'Day 1',
      className: null,
      periodMinutes: null,
      entries: [
        {
          kind: 'lesson',
          title: 'Plan',
          content: '## Read aloud (20 min)\n\nRead.\n\n## Pair talk (8 min)\n\nTalk.',
        },
      ],
    });
    expect(fromReply.instructions.map((step) => step.title)).toEqual(['Read aloud', 'Pair talk']);
  });

  test('the key changes when the stack does', () => {
    expect(planSummaryKey(ENTRIES)).toBe(planSummaryKey([...ENTRIES]));
    expect(planSummaryKey(ENTRIES)).not.toBe(planSummaryKey(ENTRIES.slice(1)));
  });
});

describe('entriesFromPacket', () => {
  test('filed pieces keep their own kind; a kept reply is a lesson with its materials after it; a deck stays a deck', async () => {
    const { buildLessonPacket } = await import('./lesson-packet');
    const { entriesFromPacket } = await import('./lesson-plan-doc');
    const packet = buildLessonPacket({
      title: 'Day 1',
      className: null,
      sections: [
        { id: 'm1', content: 'Write about what you carry.', keptTitle: 'Class Starter: Carry', origin: 'material', kind: 'handout', keptAudience: 'student' },
        {
          id: 'r1',
          content: '## Read aloud (20 min)\n\nRead.\n\n```yawp-material\nkind: notes\ntitle: Historical context\n---\nVietnam.\n```',
          keptAudience: 'teacher',
        },
        { id: 'm2', content: DECK_FENCE, keptTitle: 'Deck', origin: 'material', kind: 'slides', keptAudience: 'teacher' },
      ],
    });
    const entries = entriesFromPacket(packet, { m1: 'class-starter', m2: 'slides' });
    expect(entries.map((entry) => entry.kind)).toEqual(['class-starter', 'lesson', 'notes', 'slides']);
    expect(entries[3]!.content).toContain('yawp-slides');
  });
});

describe("buildLessonPlanDoc — the stack decides the sections (Brian's run 3, item 12)", () => {
  const base = { title: 'Day One', className: 'English 10 · Period 3', periodMinutes: 50 };

  test('a Closing step in the stack is the Closing section, never listed twice', () => {
    const doc = buildLessonPlanDoc({
      ...base,
      entries: [
        { kind: 'step', title: 'Hook: What’s in your bag? (15 min)', content: 'Students lay out their bags.' },
        { kind: 'step', title: 'Closing (3 min)', content: 'Exit ticket: one object, one sentence.' },
      ],
    });
    expect(doc.instructions.map((step) => step.title)).toEqual(['Hook: What’s in your bag?']);
    expect(doc.closingStep).toMatchObject({ title: 'Closing', minutes: 3 });
    expect(doc.closing).toContain('one object, one sentence');
    expect(doc.closingInStack).toBe(true);
  });

  test('an exit ticket at the end is the closing too', () => {
    const doc = buildLessonPlanDoc({
      ...base,
      entries: [
        { kind: 'step', title: 'Read aloud (12 min)', content: 'Read the opening.' },
        { kind: 'exit-ticket', title: 'Exit ticket (5 min)', content: 'Name one thing Cross carries.' },
      ],
    });
    expect(doc.instructions).toHaveLength(1);
    expect(doc.closingStep?.minutes).toBe(5);
  });

  test('no closing in the stack says so instead of inventing one', () => {
    const doc = buildLessonPlanDoc({
      ...base,
      entries: [{ kind: 'step', title: 'Read aloud (12 min)', content: 'Read the opening.' }],
    });
    expect(doc.closingInStack).toBe(false);
    expect(doc.closingStep).toBeNull();
    expect(doc.closing).toMatch(/^Suggested closing: not in your stack\./);
  });
});

describe('teacher notes on the plan (Oct 24 handoff, task 7)', () => {
  test('each step carries its stack step, and its notes print under it once', async () => {
    const { buildLessonPacket } = await import('./lesson-packet');
    const { entriesFromPacket, withTeacherNotes } = await import('./lesson-plan-doc');
    const packet = buildLessonPacket({
      title: 'Day 1',
      className: null,
      sections: [
        { id: 'm1', content: 'Write about what you carry.', keptTitle: 'Class Starter: Carry', origin: 'material', kind: 'handout', keptAudience: 'student' },
        { id: 'r1', content: '## Read aloud (20 min)\n\nRead the opening.', keptAudience: 'teacher' },
      ],
    });
    const entries = entriesFromPacket(packet, { m1: 'class-starter' });
    expect(entries.map((entry) => entry.id)).toEqual(['m1', 'r1']);
    const doc = withTeacherNotes(
      buildLessonPlanDoc({ title: 'Day 1', className: null, periodMinutes: 50, entries, summaries: null, standards: [] }),
      { m1: 'Open with: Ask what is in their bag.', r1: '  ' }
    );
    const all = [...doc.instructions, ...(doc.closingStep ? [doc.closingStep] : [])];
    expect(all.find((step) => step.stepId === 'm1')?.teacherNotes).toBe('Open with: Ask what is in their bag.');
    expect(all.filter((step) => step.teacherNotes)).toHaveLength(1);
  });
});

describe("If you have more time (Kevin's notes 8c, 10c)", () => {
  const entries: LessonPlanEntry[] = [
    { kind: 'class-starter', title: 'Class Starter', content: 'Write.', id: 's1' },
    { kind: 'step', title: 'Read on (15 min)', content: 'Keep reading.', id: 's2' },
    { kind: 'step', title: 'Discussion (10 min)', content: 'Talk.', id: 's3' },
    { kind: 'exit-ticket', title: 'Exit ticket', content: 'One line.', id: 's4' },
  ];

  test('extensions leave the instructions and come after the closing, in the order set aside', () => {
    const doc = buildLessonPlanDoc({ title: 'Day 1', className: null, periodMinutes: 50, entries, extensionIds: ['s3', 's2'] });
    expect(doc.instructions.map((step) => step.title)).toEqual(['Class starter']);
    expect(doc.closingStep?.title).toBe('Exit ticket');
    expect(doc.extensions.map((step) => step.title)).toEqual(['Discussion', 'Read on']);
  });

  test('none set aside: no section', () => {
    const doc = buildLessonPlanDoc({ title: 'Day 1', className: null, periodMinutes: 50, entries });
    expect(doc.extensions).toEqual([]);
    expect(doc.instructions).toHaveLength(3);
  });
});
