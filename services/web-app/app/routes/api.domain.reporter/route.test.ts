import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';

const getLLMCompletion = mock();
const requireMutableRequest = mock();
const requireReporterAccess = mock();
const handleReporterToolCall = mock();

const prisma = {
  reporterConversation: {
    findFirst: mock(),
    create: mock(),
    update: mock(),
  },
  reporterMessage: {
    count: mock(),
  },
};

mock.module('~/utils/auth.server', () => ({ requireMutableRequest }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/reporter/reporter-access.server', () => ({
  requireReporterAccess,
}));
mock.module('~/domain/reporter/reporter-tools.server', () => ({
  handleReporterToolCall,
  REPORTER_TOOLS: [{ name: 'list_classes' }],
}));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));

const { LlmFallbackRetrySignal } = await import(
  '~/utils/getLLMCompletion/llm-provider-errors.server'
);
const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

function formRequest(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request('http://localhost/api/domain/reporter', {
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
  requireReporterAccess.mockReset().mockResolvedValue(access);
  handleReporterToolCall.mockReset();
  prisma.reporterConversation.findFirst.mockReset();
  prisma.reporterConversation.create.mockReset();
  prisma.reporterConversation.update.mockReset();
  prisma.reporterMessage.count.mockReset().mockResolvedValue(0);
});

describe('api.domain.reporter action', () => {
  test('creates a conversation and persists both turns on first message', async () => {
    getLLMCompletion.mockResolvedValue('Here is your report.');
    prisma.reporterConversation.create.mockResolvedValue({
      id: 'conv-1',
      messages: [],
    });
    prisma.reporterConversation.update.mockResolvedValue({});

    const response = await action({
      request: formRequest({ message: 'How is my class doing?' }),
    } as any);
    const body = (await response.data) as any;

    expect(body.conversationId).toBe('conv-1');
    expect(body.reply).toBe('Here is your report.');
    expect(body.isNewConversation).toBe(true);

    // Conversation created scoped to the teacher, title derived from message.
    const createArg = prisma.reporterConversation.create.mock.calls[0][0].data;
    expect(createArg.membershipId).toBe('teacher-1');
    expect(createArg.organizationId).toBe('org-1');
    expect(createArg.title).toBe('How is my class doing?');

    // Both user and assistant messages persisted.
    const updateArg = prisma.reporterConversation.update.mock.calls[0][0];
    const created = updateArg.data.messages.create;
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      role: 'user',
      content: 'How is my class doing?',
    });
    expect(created[1]).toMatchObject({
      role: 'assistant',
      content: 'Here is your report.',
    });
    // Explicit, strictly-increasing timestamps: both rows are written in one
    // nested create, so leaving createdAt to the DB default would tie them and
    // make replay order ambiguous.
    expect(created[0].createdAt).toBeInstanceOf(Date);
    expect(created[1].createdAt).toBeInstanceOf(Date);
    expect(created[1].createdAt.getTime()).toBeGreaterThan(
      created[0].createdAt.getTime()
    );
  });

  test('passes reporter tools and a teacher-scoped context to the LLM', async () => {
    getLLMCompletion.mockResolvedValue('ok');
    prisma.reporterConversation.create.mockResolvedValue({
      id: 'conv-1',
      messages: [],
    });
    prisma.reporterConversation.update.mockResolvedValue({});

    await action({ request: formRequest({ message: 'hi' }) } as any);

    const llmArgs = getLLMCompletion.mock.calls[0][0];
    expect(llmArgs.tools).toEqual([{ name: 'list_classes' }]);
    expect(llmArgs.metadata.feature).toBe('reporter');
    expect(llmArgs.logPayload).toBe('metadata-only');
    expect(llmArgs.signal).toBeInstanceOf(AbortSignal);

    // The handleToolCall closure must bind the calling teacher's scope.
    llmArgs.handleToolCall('list_classes', { a: 1 });
    expect(handleReporterToolCall).toHaveBeenCalledWith(
      'list_classes',
      { a: 1 },
      {
        membershipId: 'teacher-1',
        organizationId: 'org-1',
      }
    );
  });

  test('continues an existing conversation with prior messages', async () => {
    prisma.reporterConversation.findFirst.mockResolvedValue({
      id: 'conv-9',
      messages: [
        { role: 'assistant', content: 'earlier answer' },
        { role: 'user', content: 'earlier question' },
      ],
    });
    getLLMCompletion.mockResolvedValue('follow-up answer');
    prisma.reporterConversation.update.mockResolvedValue({});

    const response = await action({
      request: formRequest({ message: 'and now?', conversationId: 'conv-9' }),
    } as any);
    const body = (await response.data) as any;

    expect(body.isNewConversation).toBe(false);
    expect(prisma.reporterConversation.create).not.toHaveBeenCalled();
    const llmMessages = getLLMCompletion.mock.calls[0][0].messages;
    expect(llmMessages).toHaveLength(3); // 2 prior + new user
    expect(llmMessages[0]).toMatchObject({
      role: 'user',
      content: 'earlier question',
    });
    expect(llmMessages[2]).toMatchObject({ role: 'user', content: 'and now?' });

    // Prior messages are replayed in insertion order, with the message id as a
    // deterministic tiebreak for legacy rows whose timestamps tie.
    const findArg = prisma.reporterConversation.findFirst.mock.calls[0][0];
    expect(findArg.include.messages).toMatchObject({
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: 20,
    });
  });

  test('bounds long histories by character count before calling the model', async () => {
    prisma.reporterConversation.findFirst.mockResolvedValue({
      id: 'conv-9',
      messages: Array.from({ length: 20 }, (_, index) => ({
        role: index % 2 ? 'user' : 'assistant',
        content: `${index}-${'x'.repeat(2_000)}`,
      })),
    });
    getLLMCompletion.mockResolvedValue('bounded');
    prisma.reporterConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({ message: 'new', conversationId: 'conv-9' }),
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

  test('rejects oversized messages before calling the model', async () => {
    const response = await action({
      request: formRequest({ message: 'x'.repeat(4_001) }),
    } as any);

    expect(response.init?.status).toBe(422);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('rate-limits rapid reporter requests per teacher', async () => {
    prisma.reporterMessage.count
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(8);

    const response = await action({
      request: formRequest({ message: 'one more' }),
    } as any);

    expect(response.init?.status).toBe(429);
    expect(response.data).toMatchObject({
      error: 'Too many reporter requests. Please wait a moment and try again.',
    });
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
    expect(response.data).toEqual({
      error: 'The reporter could not put that together. Please try again.',
    });
    expect(JSON.stringify(response.data)).not.toContain('provider-secret');
    expect(prisma.reporterConversation.create).not.toHaveBeenCalled();
  });

  test('returns a 202 retry signal when the primary provider is down', async () => {
    getLLMCompletion.mockRejectedValue(
      new LlmFallbackRetrySignal({
        fallbackModel: 'fallback-model',
        reason: 'anthropic outage',
      })
    );

    const response = await action({
      request: formRequest({ message: 'hi' }),
    } as any);

    expect(response.init?.status).toBe(202);
    expect((response.data as any).retrying).toBe(true);
    // No half-written history: the conversation is only created on success.
    expect(prisma.reporterConversation.create).not.toHaveBeenCalled();
  });

  test('forces the fallback provider and disables re-signaling on llmRetry', async () => {
    getLLMCompletion.mockResolvedValue('fallback answer');
    prisma.reporterConversation.create.mockResolvedValue({
      id: 'conv-2',
      messages: [],
    });
    prisma.reporterConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({ message: 'hi', llmRetry: 'fallback' }),
    } as any);

    const llmArgs = getLLMCompletion.mock.calls[0][0];
    expect(llmArgs.forceFallback).toBe(true);
    expect(llmArgs.signalFallbackRetry).toBe(false);
  });

  test('returns 404 when a conversationId does not belong to the teacher', async () => {
    prisma.reporterConversation.findFirst.mockResolvedValue(null);
    const response = await action({
      request: formRequest({ message: 'hi', conversationId: 'not-mine' }),
    } as any);
    expect(response.init?.status).toBe(404);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('does not create a conversation when the LLM call fails', async () => {
    getLLMCompletion.mockRejectedValue(new Error('boom'));
    const response = await action({
      request: formRequest({ message: 'hi' }),
    } as any);
    expect(response.init?.status).toBe(500);
    expect(prisma.reporterConversation.create).not.toHaveBeenCalled();
  });
});
