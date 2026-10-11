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
