import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const getLLMCompletion = mock();
const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();
const handleLessonPlannerToolCall = mock();
const reserveAiRequest = mock();
class AiRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('rate limited');
  }
}

const prisma = {
  lessonPlanConversation: {
    findFirst: mock(),
    create: mock(),
    update: mock(),
  },
  classAssignment: {
    findFirst: mock(),
  },
  $transaction: mock(),
};

mock.module('~/utils/auth.server', () => ({ requireMutableRequest }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({
  requireLessonPlannerAccess,
}));
mock.module('~/domain/lesson-planner/lesson-planner-tools.server', () => ({
  handleLessonPlannerToolCall,
  LESSON_PLANNER_TOOLS: [{ name: 'list_classes' }],
}));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));
mock.module('~/utils/ai-admission.server', () => ({
  AiRateLimitError,
  reserveAiRequest,
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

function formRequest(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request('http://localhost/api/domain/lesson-planner', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

const access = {
  userId: 'user-1',
  membership: {
    id: 'teacher-1',
    role: 'TEACHER',
    isOrgOwner: false,
    organization: { id: 'org-1', name: 'Test Org' },
  },
  isTeacher: true,
  enabled: true,
  allowed: true,
};

beforeEach(() => {
  getLLMCompletion.mockReset();
  requireMutableRequest.mockReset().mockResolvedValue(undefined);
  requireLessonPlannerAccess.mockReset().mockResolvedValue(access);
  handleLessonPlannerToolCall.mockReset();
  reserveAiRequest.mockReset().mockResolvedValue(undefined);
  prisma.lessonPlanConversation.findFirst.mockReset();
  prisma.lessonPlanConversation.create.mockReset();
  prisma.lessonPlanConversation.update.mockReset();
  prisma.classAssignment.findFirst.mockReset().mockResolvedValue(null);
  prisma.$transaction.mockReset();
  prisma.$transaction.mockImplementation(
    async (callback: (client: typeof prisma) => unknown) => callback(prisma)
  );
});

describe('api.domain.lesson-planner action', () => {
  test('creates a conversation and persists both turns on first message', async () => {
    getLLMCompletion.mockResolvedValue('Here is your lesson.');
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    const response = await action({
      request: formRequest({ message: 'Lesson on conclusion paragraphs' }),
    } as any);
    const body = (await response.data) as any;

    expect(body.conversationId).toBe('plan-1');
    expect(body.reply).toBe('Here is your lesson.');
    expect(body.isNewConversation).toBe(true);

    const createArg = prisma.lessonPlanConversation.create.mock.calls[0][0].data;
    expect(createArg.membershipId).toBe('teacher-1');
    expect(createArg.organizationId).toBe('org-1');
    expect(createArg.title).toBe('Lesson on conclusion paragraphs');

    const updateArg = prisma.lessonPlanConversation.update.mock.calls[0][0];
    const created = updateArg.data.messages.create;
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      role: 'user',
      content: 'Lesson on conclusion paragraphs',
    });
    expect(created[1]).toMatchObject({
      role: 'assistant',
      content: 'Here is your lesson.',
    });
    // Explicit, strictly-increasing timestamps: both rows are written in one
    // nested create, so the DB default would tie them and leave replay order
    // ambiguous.
    expect(created[1].createdAt.getTime()).toBeGreaterThan(
      created[0].createdAt.getTime()
    );
  });

  test('passes the planner tool allowlist and a teacher-scoped context to the LLM', async () => {
    getLLMCompletion.mockResolvedValue('ok');
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({ request: formRequest({ message: 'hi' }) } as any);

    const llmArgs = getLLMCompletion.mock.calls[0][0];
    expect(llmArgs.tools).toEqual([{ name: 'list_classes' }]);
    expect(llmArgs.metadata.feature).toBe('lesson-planner');
    expect(llmArgs.logPayload).toBe('metadata-only');
    expect(llmArgs.allowFallbackProvider).toBe(false);
    expect(llmArgs.signal).toBeInstanceOf(AbortSignal);

    llmArgs.handleToolCall('list_classes', { a: 1 });
    expect(handleLessonPlannerToolCall).toHaveBeenCalledWith(
      'list_classes',
      { a: 1 },
      { membershipId: 'teacher-1', organizationId: 'org-1' }
    );
  });

  test('reserves admission under its own feature budget', async () => {
    getLLMCompletion.mockResolvedValue('ok');
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({ request: formRequest({ message: 'hi' }) } as any);

    expect(reserveAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipId: 'teacher-1',
        organizationId: 'org-1',
        feature: 'lesson-planner',
      })
    );
  });

  test('continues an existing conversation with prior messages', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({
      id: 'plan-9',
      messages: [
        { role: 'assistant', content: 'earlier plan' },
        { role: 'user', content: 'earlier ask' },
      ],
    });
    getLLMCompletion.mockResolvedValue('follow-up plan');
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    const response = await action({
      request: formRequest({
        message: 'now make the deck',
        conversationId: 'plan-9',
      }),
    } as any);
    const body = (await response.data) as any;

    expect(body.isNewConversation).toBe(false);
    expect(prisma.lessonPlanConversation.create).not.toHaveBeenCalled();
    const llmMessages = getLLMCompletion.mock.calls[0][0].messages;
    expect(llmMessages).toHaveLength(3);
    expect(llmMessages[0]).toMatchObject({
      role: 'user',
      content: 'earlier ask',
    });
    expect(llmMessages[2]).toMatchObject({
      role: 'user',
      content: 'now make the deck',
    });

    const findArg = prisma.lessonPlanConversation.findFirst.mock.calls[0][0];
    expect(findArg.where).toMatchObject({
      id: 'plan-9',
      membershipId: 'teacher-1',
      deletedAt: null,
    });
    expect(findArg.include.messages).toMatchObject({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
  });

  test('bounds long histories by character count before calling the model', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({
      id: 'plan-9',
      messages: Array.from({ length: 20 }, (_, index) => ({
        role: index % 2 ? 'user' : 'assistant',
        content: `${index}-${'x'.repeat(2_000)}`,
      })),
    });
    getLLMCompletion.mockResolvedValue('bounded');
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({ message: 'new', conversationId: 'plan-9' }),
    } as any);

    const llmMessages = getLLMCompletion.mock.calls[0][0].messages;
    expect(llmMessages.length).toBeLessThan(21);
    expect(
      llmMessages.reduce(
        (total: number, message: { content: string }) =>
          total + message.content.length,
        0
      )
    ).toBeLessThanOrEqual(24_003);
    expect(llmMessages.at(-1)).toMatchObject({ role: 'user', content: 'new' });
  });

  test('records the Class Summary next step a session was opened from', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue({ id: 'ca-1' });
    getLLMCompletion.mockResolvedValue('ok');
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({ message: 'hi', originClassAssignmentId: 'ca-1' }),
    } as any);

    // The origin is only trusted after it is re-checked against the teacher's
    // own classes.
    expect(prisma.classAssignment.findFirst.mock.calls[0][0].where).toMatchObject(
      {
        id: 'ca-1',
        class: { teachers: { some: { id: 'teacher-1' } } },
      }
    );
    expect(
      prisma.lessonPlanConversation.create.mock.calls[0][0].data
        .originClassAssignmentId
    ).toBe('ca-1');
  });

  test('drops an origin that does not belong to the teacher', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);
    getLLMCompletion.mockResolvedValue('ok');
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({
        message: 'hi',
        originClassAssignmentId: 'someone-elses',
      }),
    } as any);

    expect(
      prisma.lessonPlanConversation.create.mock.calls[0][0].data
        .originClassAssignmentId
    ).toBeNull();
  });

  test('rejects oversized messages before calling the model', async () => {
    const response = await action({
      request: formRequest({ message: 'x'.repeat(6_001) }),
    } as any);

    expect(response.init?.status).toBe(422);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('rate-limits rapid planner requests per teacher', async () => {
    reserveAiRequest.mockRejectedValueOnce(new AiRateLimitError(60));

    const response = await action({
      request: formRequest({ message: 'one more' }),
    } as any);

    expect(response.init?.status).toBe(429);
    expect(response.init?.headers).toMatchObject({ 'Retry-After': '60' });
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('does not expose provider errors to the client', async () => {
    getLLMCompletion.mockRejectedValue(
      new Error('provider-secret request identifier')
    );

    const response = await action({
      request: formRequest({ message: 'hi' }),
    } as any);

    expect(response.init?.status).toBe(500);
    expect(JSON.stringify(response.data)).not.toContain('provider-secret');
    expect(prisma.lessonPlanConversation.create).not.toHaveBeenCalled();
  });

  test('never accepts a client request to transfer planner data to fallback', async () => {
    const response = await action({
      request: formRequest({ message: 'hi', llmRetry: 'fallback' }),
    } as any);

    expect(response.init?.status).toBe(422);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('returns 404 when a conversationId does not belong to the teacher', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue(null);

    const response = await action({
      request: formRequest({ message: 'hi', conversationId: 'not-mine' }),
    } as any);

    expect(response.init?.status).toBe(404);
    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(reserveAiRequest).not.toHaveBeenCalled();
  });
});
