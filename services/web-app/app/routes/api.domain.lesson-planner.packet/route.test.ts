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
  return new Request('http://localhost/api/domain/lesson-planner/packet', {
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

describe('lesson packet action', () => {
  test('keeps a reply for the packet with an audience', async () => {
    const response = await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        audience: 'student',
      }),
    } as any);

    expect(response.data).toMatchObject({ kept: true });
    const update = prisma.lessonPlanMessage.updateMany.mock.calls[0][0];
    // Scoped through the conversation the teacher was just proven to own.
    expect(update.where).toMatchObject({
      id: 'msg-1',
      conversationId: 'plan-1',
      role: 'assistant',
    });
    expect(update.data.keptAudience).toBe('student');
    expect(update.data.keptAt).toBeInstanceOf(Date);
  });

  test('defaults a kept section to the teacher-facing plan', async () => {
    await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'msg-1',
      }),
    } as any);

    expect(
      prisma.lessonPlanMessage.updateMany.mock.calls[0][0].data.keptAudience
    ).toBe('teacher');
  });

  test('rejects an audience it does not recognize', async () => {
    const response = await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        audience: 'parents',
      }),
    } as any);

    expect(response.init?.status).toBe(422);
    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });

  test('drops a section back out of the packet', async () => {
    const response = await action({
      request: formRequest({
        intent: 'drop',
        conversationId: 'plan-1',
        messageId: 'msg-1',
      }),
    } as any);

    expect(response.data).toMatchObject({ kept: false });
    const update = prisma.lessonPlanMessage.updateMany.mock.calls[0][0];
    expect(update.data).toEqual({ keptAt: null, keptAudience: null });
  });

  test('renames the packet', async () => {
    const response = await action({
      request: formRequest({
        intent: 'rename',
        conversationId: 'plan-1',
        packetTitle: '  Conclusions, period 3  ',
      }),
    } as any);

    expect(response.data).toMatchObject({
      packetTitle: 'Conclusions, period 3',
    });
    expect(
      prisma.lessonPlanConversation.update.mock.calls[0][0].data.packetTitle
    ).toBe('Conclusions, period 3');
  });

  test('clears a blank name back to the conversation title', async () => {
    await action({
      request: formRequest({
        intent: 'rename',
        conversationId: 'plan-1',
        packetTitle: '   ',
      }),
    } as any);

    expect(
      prisma.lessonPlanConversation.update.mock.calls[0][0].data.packetTitle
    ).toBeNull();
  });

  test('renames a saved resource', async () => {
    const response = await action({
      request: formRequest({
        intent: 'rename-section',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        sectionTitle: '  Fix-It sentences  ',
      }),
    } as any);

    expect(response.data).toMatchObject({ sectionTitle: 'Fix-It sentences' });
    const update = prisma.lessonPlanMessage.updateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({
      id: 'msg-1',
      conversationId: 'plan-1',
      role: 'assistant',
    });
    expect(update.data).toEqual({ keptTitle: 'Fix-It sentences' });
  });

  test('clears a blank resource name back to the derived title', async () => {
    await action({
      request: formRequest({
        intent: 'rename-section',
        conversationId: 'plan-1',
        messageId: 'msg-1',
        sectionTitle: '   ',
      }),
    } as any);

    expect(
      prisma.lessonPlanMessage.updateMany.mock.calls[0][0].data.keptTitle
    ).toBeNull();
  });

  test('will not rename a section outside the conversation', async () => {
    prisma.lessonPlanMessage.updateMany.mockResolvedValue({ count: 0 });

    const response = await action({
      request: formRequest({
        intent: 'rename-section',
        conversationId: 'plan-1',
        messageId: 'not-in-here',
        sectionTitle: 'Anything',
      }),
    } as any);

    expect(response.init?.status).toBe(404);
  });

  test('requires a message to rename a section', async () => {
    const response = await action({
      request: formRequest({
        intent: 'rename-section',
        conversationId: 'plan-1',
        sectionTitle: 'Orphan',
      }),
    } as any);

    expect(response.init?.status).toBe(422);
    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });

  test('refuses a conversation that is not the teacher’s', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue(null);

    const response = await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'someone-elses',
        messageId: 'msg-1',
      }),
    } as any);

    expect(response.init?.status).toBe(404);
    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });

  test('scopes the ownership check to the calling teacher', async () => {
    await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'msg-1',
      }),
    } as any);

    expect(
      prisma.lessonPlanConversation.findFirst.mock.calls[0][0].where
    ).toMatchObject({
      id: 'plan-1',
      membershipId: 'teacher-1',
      deletedAt: null,
    });
  });

  test('reports when the message did not belong to the conversation', async () => {
    prisma.lessonPlanMessage.updateMany.mockResolvedValue({ count: 0 });

    const response = await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'not-in-here',
      }),
    } as any);

    expect(response.init?.status).toBe(404);
  });

  test('rejects an unknown intent', async () => {
    const response = await action({
      request: formRequest({
        intent: 'delete-everything',
        conversationId: 'plan-1',
      }),
    } as any);

    expect(response.init?.status).toBe(422);
  });

  test('requires a mutable request before touching anything', async () => {
    requireMutableRequest.mockRejectedValue(
      new Response(null, { status: 403 })
    );

    await action({
      request: formRequest({
        intent: 'keep',
        conversationId: 'plan-1',
        messageId: 'msg-1',
      }),
    } as any).catch(() => undefined);

    expect(prisma.lessonPlanMessage.updateMany).not.toHaveBeenCalled();
  });
});
