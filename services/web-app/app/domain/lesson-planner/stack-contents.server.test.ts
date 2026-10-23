import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  lessonPlanMessage: { findMany: mock() },
  lessonPlanMaterial: { findMany: mock() },
};
mock.module('~/utils/db.server', () => ({ prisma }));

const { loadStackContents } = await import('./stack-contents.server');

beforeEach(() => {
  prisma.lessonPlanMessage.findMany.mockReset().mockResolvedValue([
    {
      createdAt: new Date('2026-10-11T10:00:05Z'),
      content: '## Reading (40 min)\n\nRead the first story together.',
      keptTitle: null,
    },
  ]);
  prisma.lessonPlanMaterial.findMany.mockReset().mockResolvedValue([
    {
      sourceCreatedAt: new Date('2026-10-11T10:00:01Z'),
      kind: 'class-starter',
      title: 'Class Starter: Write about something you carry',
      content: 'Write about something you carry every day.',
    },
    {
      sourceCreatedAt: new Date('2026-10-11T10:00:09Z'),
      kind: 'exit-ticket',
      title: 'Exit ticket',
      content: 'What weighed nothing?',
    },
  ]);
});

describe("loadStackContents (Brian's review, B6)", () => {
  test('returns kept replies and filed pieces in lesson order', async () => {
    const entries = await loadStackContents('plan-1');
    expect(entries.map((entry) => entry.kind)).toEqual([
      'class-starter',
      'lesson',
      'exit-ticket',
    ]);
    expect(entries[1].title).toBe('Reading (40 min)');
  });

  test('only reads this lesson', async () => {
    await loadStackContents('plan-1');
    expect(
      prisma.lessonPlanMaterial.findMany.mock.calls[0][0].where
    ).toEqual({ conversationId: 'plan-1' });
    expect(prisma.lessonPlanMessage.findMany.mock.calls[0][0].where).toEqual({
      conversationId: 'plan-1',
      role: 'assistant',
      keptAt: { not: null },
    });
  });
});

describe("loadStackContents — the teacher's order (Brian's run 2, A1)", () => {
  test('a reordered stack is built from in the order the teacher set', async () => {
    prisma.lessonPlanMessage.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-10-11T10:00:05Z'),
        content: '## Reading (40 min)\n\nRead.',
        keptTitle: null,
        position: 2,
      },
    ]);
    prisma.lessonPlanMaterial.findMany.mockResolvedValue([
      {
        sourceCreatedAt: new Date('2026-10-11T10:00:01Z'),
        kind: 'class-starter',
        title: 'Starter',
        content: 'Write.',
        position: 1,
      },
      {
        sourceCreatedAt: new Date('2026-10-11T10:00:09Z'),
        kind: 'exit-ticket',
        title: 'Exit ticket',
        content: 'What weighed nothing?',
        position: 0,
      },
    ]);
    const entries = await loadStackContents('plan-1');
    expect(entries.map((entry) => entry.kind)).toEqual(['exit-ticket', 'class-starter', 'lesson']);
  });
});

describe("loadStackContents — a rebuilt deck starts fresh (Brian's run 2, C1)", () => {
  test('can leave the existing deck out, so it cannot seed the new one', async () => {
    prisma.lessonPlanMaterial.findMany.mockResolvedValue([
      { sourceCreatedAt: new Date('2026-10-11T10:00:01Z'), kind: 'notes', title: 'Framing', content: 'Vietnam.' },
      { sourceCreatedAt: new Date('2026-10-11T10:00:02Z'), kind: 'slides', title: 'Old deck', content: '```yawp-slides\n{}\n```' },
    ]);
    const entries = await loadStackContents('plan-1', { leaveOutDeck: true });
    expect(entries.map((entry) => entry.kind)).not.toContain('slides');
  });
});
