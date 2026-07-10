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
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'earlier answer' },
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
    expect(llmMessages[2]).toMatchObject({ role: 'user', content: 'and now?' });
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
