import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const prisma = {
  lessonPlanMessage: { count: mock(), findMany: mock() },
  lessonPlanConversation: { count: mock() },
};

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireMutableRequest: mock(),
}));
mock.module('~/utils/db.server', () => ({ prisma }));

const { loader, replyExcerpt } = await import('./route');

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ id: 'admin-1' });
  prisma.lessonPlanMessage.count
    .mockReset()
    .mockImplementation(({ where }: any) =>
      Promise.resolve(where.rating === 'up' ? 7 : 3)
    );
  prisma.lessonPlanConversation.count
    .mockReset()
    .mockImplementation(({ where }: any) =>
      Promise.resolve(where.taughtAt ? 4 : 20)
    );
  prisma.lessonPlanMessage.findMany.mockReset().mockResolvedValue([
    {
      id: 'msg-1',
      rating: 'down',
      ratingNote: 'Too long.',
      ratedAt: new Date('2026-10-08T10:00:00.000Z'),
      content: '## The quote is the start, not the point\n\nObjective: …',
      conversation: {
        id: 'plan-1',
        title: 'Quote analysis',
        taughtAt: null,
        organization: { name: 'Connell School' },
      },
    },
  ]);
});

describe('admin lesson planner feedback loader', () => {
  test('is for admins only', async () => {
    requireAdmin.mockRejectedValue(new Response(null, { status: 403 }));
    await expect(
      loader({
        request: new Request('https://example.test/app/admin/lesson-planner'),
      } as any)
    ).rejects.toBeInstanceOf(Response);
    expect(prisma.lessonPlanMessage.findMany).not.toHaveBeenCalled();
  });

  test('totals the verdicts and the lessons taught', async () => {
    const result: any = await loader({
      request: new Request('https://example.test/app/admin/lesson-planner'),
    } as any);
    const data = result.data ?? result;
    expect(data.totals).toEqual({ up: 7, down: 3, taught: 4, lessons: 20 });
  });

  test('lists recent verdicts, newest first, with what the reply was', async () => {
    const result: any = await loader({
      request: new Request(
        'https://example.test/app/admin/lesson-planner?rating=down'
      ),
    } as any);
    const data = result.data ?? result;

    const query = prisma.lessonPlanMessage.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ rating: 'down', ratedAt: { not: null } });
    expect(query.orderBy).toEqual({ ratedAt: 'desc' });
    expect(data.recent[0]).toMatchObject({
      rating: 'down',
      note: 'Too long.',
      reply: 'The quote is the start, not the point',
      lesson: 'Quote analysis',
      organization: 'Connell School',
      taught: false,
    });
  });

  test('ignores a filter it does not recognize', async () => {
    await loader({
      request: new Request(
        'https://example.test/app/admin/lesson-planner?rating=meh'
      ),
    } as any);
    const query = prisma.lessonPlanMessage.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ ratedAt: { not: null } });
  });
});

describe('replyExcerpt', () => {
  test('names a reply by its first heading', () => {
    expect(replyExcerpt('Intro line\n\n## Warm-up (5 min)\n\nText')).toBe(
      'Warm-up (5 min)'
    );
  });

  test('falls back to its first line of prose, never a block', () => {
    expect(
      replyExcerpt('```yawp-slides\n{"title":"x"}\n```\n\nHere is the deck.')
    ).toBe('Here is the deck.');
  });

  test('keeps a long line short', () => {
    expect(replyExcerpt('a'.repeat(300)).length).toBeLessThanOrEqual(140);
  });
});
