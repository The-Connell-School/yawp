import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  lessonPlanConversation: { findMany: mock(), findFirst: mock() },
  lessonPlanMessage: { findMany: mock(), findFirst: mock() },
  lessonPlanMaterial: { findMany: mock() },
};
mock.module('~/utils/db.server', () => ({ prisma }));

const { searchMyLessons, readMyLesson } = await import('./my-lessons.server');
const ctx = { membershipId: 'member-1', organizationId: 'org-1' };

beforeEach(() => {
  prisma.lessonPlanConversation.findMany.mockReset().mockResolvedValue([
    {
      id: 'plan-7',
      title: 'The Things They Carried — Day 1',
      packetTitle: null,
      updatedAt: new Date('2026-10-01T10:00:00Z'),
      publishedAt: null,
      _count: { materials: 3, messages: 1 },
    },
  ]);
  prisma.lessonPlanConversation.findFirst.mockReset().mockResolvedValue(null);
  prisma.lessonPlanMessage.findMany.mockReset().mockResolvedValue([]);
  prisma.lessonPlanMessage.findFirst.mockReset().mockResolvedValue(null);
  prisma.lessonPlanMaterial.findMany.mockReset().mockResolvedValue([]);
});

describe("searchMyLessons (Brian's review, D3)", () => {
  test('is scoped to the teacher and skips deleted lessons', async () => {
    await searchMyLessons(ctx, 'carried');
    const where = prisma.lessonPlanConversation.findMany.mock.calls[0][0].where;
    expect(where.membershipId).toBe('member-1');
    expect(where.deletedAt).toBeNull();
  });

  test('matches the query against names, pieces, and what the teacher asked', async () => {
    await searchMyLessons(ctx, 'carried');
    const where = prisma.lessonPlanConversation.findMany.mock.calls[0][0].where;
    const text = JSON.stringify(where.OR);
    expect(text).toContain('title');
    expect(text).toContain('packetTitle');
    expect(text).toContain('materials');
    expect(text).toContain('messages');
  });

  test('returns a short listing with the piece count', async () => {
    const lessons = await searchMyLessons(ctx, 'carried');
    expect(lessons).toEqual([
      {
        id: 'plan-7',
        title: 'The Things They Carried — Day 1',
        updatedAt: '2026-10-01',
        published: false,
        pieces: 4,
      },
    ]);
  });

  test('an empty query lists the most recent lessons', async () => {
    await searchMyLessons(ctx, '');
    const where = prisma.lessonPlanConversation.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });
});

describe('readMyLesson', () => {
  test('refuses a lesson that is not this teacher’s', async () => {
    const out = await readMyLesson(ctx, 'someone-elses');
    expect(out).toEqual({ error: expect.any(String) });
    expect(prisma.lessonPlanConversation.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'someone-elses',
      membershipId: 'member-1',
      deletedAt: null,
    });
  });
});
