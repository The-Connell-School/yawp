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
    expect(doc.instructions.map((step) => step.title)).toEqual([
      'Class starter',
      'Historical context',
      'Literary context',
      'Read aloud',
      'Inventory chart',
      'Exit ticket',
    ]);
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
    expect(doc.instructions[5]!.purpose).toContain('before they leave');
  });

  test('materials by name only, the deck among them', () => {
    expect(doc.materials).toEqual([
      'Class starter (YAWP! assignment): What do you carry?',
      'Inventory chart (handout)',
      'Exit ticket (YAWP! assignment)',
      'Slide deck: The Things They Carried — Day 1 (2 slides)',
    ]);
  });

  test('overview, goals and a closing a teacher can add to', () => {
    expect(doc.overview).toContain('50-minute');
    expect(doc.overview).toContain('English 11 · Period 5');
    expect(doc.goals.length).toBeGreaterThan(0);
    expect(doc.closing).toContain('exit ticket');
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
