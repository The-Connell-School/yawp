import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();

const prisma = {
  lessonPlanConversation: { findFirst: mock(), update: mock() },
  lessonPlanMessage: { updateMany: mock() },
};

mock.module('~/utils/auth.server', () => ({
  requireMutableRequest,
  requireUserId: mock(),
  requireMembership: mock(),
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({
  requireLessonPlannerAccess,
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

function formRequest(fields: Record<string, string>) {
  return new Request('http://localhost/api/domain/lesson-planner/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

const access = {
  membership: { id: 'teacher-1', organization: { id: 'org-1', name: 'Org' } },
  allowed: true,
};

beforeEach(() => {
  requireMutableRequest.mockReset().mockResolvedValue(undefined);
  requireLessonPlannerAccess.mockReset().mockResolvedValue(access);
  prisma.lessonPlanConversation.findFirst
    .mockReset()
    .mockResolvedValue({ id: 'plan-1' });
  prisma.lessonPlanConversation.update.mockReset().mockResolvedValue({});
  prisma.lessonPlanMessage.updateMany
    .mockReset()
    .mockResolvedValue({ count: 1 });
});

describe('lesson planner feedback — rating a reply', () => {
  test('records a thumbs up on a reply in the teacher’s own lesson', async () => {
    const response = await action({
      request: formRequest({
        intent: 'rate',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        rating: 'up',
      }),
    } as any);

    expect(
      prisma.lessonPlanConversation.findFirst.mock.calls[0][0].where
    ).toMatchObject({
      id: 'plan-1',
      membershipId: 'teacher-1',
      deletedAt: null,
    });
    const update = prisma.lessonPlanMessage.updateMany.mock.calls[0][0];
    // Anchored to the conversation, and only ever an assistant reply.
    expect(update.where).toEqual({
      id: 'msg-1',
      conversationId: 'plan-1',
      role: 'assistant',
    });
    expect(update.data.rating).toBe('up');
    expect(update.data.ratingNote).toBeNull();
    expect(update.data.ratedAt).toBeInstanceOf(Date);
    expect((response as any).data).toEqual({ rating: 'up' });
  });

  test('keeps what was off on a thumbs down, trimmed', async () => {
    await action({
      request: formRequest({
        intent: 'rate',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        rating: 'down',
        note: '  Too long for a 45-minute period  ',
      }),
    } as any);

    const update = prisma.lessonPlanMessage.updateMany.mock.calls[0][0];
    expect(update.data).toMatchObject({
      rating: 'down',
      ratingNote: 'Too long for a 45-minute period',
    });
  });

  test('clearing a rating takes the note with it', async () => {
    await action({
      request: formRequest({
        intent: 'rate',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        rating: 'clear',
      }),
    } as any);

    const update = prisma.lessonPlanMessage.updateMany.mock.calls[0][0];
    expect(update.data).toEqual({
      rating: null,
      ratingNote: null,
      ratedAt: null,
    });
  });

  test('404s on a reply that is not in this lesson, or is the teacher’s own turn', async () => {
    prisma.lessonPlanMessage.updateMany.mockResolvedValue({ count: 0 });
    const response = await action({
      request: formRequest({
        intent: 'rate',
        conversationId: 'plan-1',
        messageId: 'someone-elses',
        rating: 'up',
      }),
    } as any);
    expect((response as any).init?.status).toBe(404);
  });

  test('refuses a lesson that is not the teacher’s', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue(null);
    const response = await action({
      request: formRequest({
        intent: 'rate',
        conversationId: 'plan-2',
        messageId: 'msg-1',
        rating: 'up',
      }),
    } as any);
    expect((response as any).init?.status).toBe(404);
    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });

  test('rejects a rating it does not recognize, and a rate with no reply', async () => {
    const unknown = await action({
      request: formRequest({
        intent: 'rate',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        rating: 'meh',
      }),
    } as any);
    expect((unknown as any).init?.status).toBe(422);

    const noMessage = await action({
      request: formRequest({
        intent: 'rate',
        conversationId: 'plan-1',
        rating: 'up',
      }),
    } as any);
    expect((noMessage as any).init?.status).toBe(422);
    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });

  test('never writes for a read-only session', async () => {
    requireMutableRequest.mockRejectedValue(
      new Response(null, { status: 403 })
    );
    await expect(
      action({
        request: formRequest({
          intent: 'rate',
          conversationId: 'plan-1',
          messageId: 'msg-1',
          rating: 'up',
        }),
      } as any)
    ).rejects.toBeInstanceOf(Response);
    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });
});

describe('lesson planner feedback — I taught this', () => {
  test('marks the lesson taught', async () => {
    const response = await action({
      request: formRequest({ intent: 'taught', conversationId: 'plan-1' }),
    } as any);
    const update = prisma.lessonPlanConversation.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'plan-1' });
    expect(update.data.taughtAt).toBeInstanceOf(Date);
    expect((response as any).data.taughtAt).toBeString();
  });

  test('takes it back', async () => {
    const response = await action({
      request: formRequest({ intent: 'untaught', conversationId: 'plan-1' }),
    } as any);
    expect(prisma.lessonPlanConversation.update.mock.calls[0][0].data).toEqual({
      taughtAt: null,
    });
    expect((response as any).data.taughtAt).toBeNull();
  });
});
