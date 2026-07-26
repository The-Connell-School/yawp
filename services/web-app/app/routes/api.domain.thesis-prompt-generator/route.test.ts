import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getLLMCompletion = mock();
const recordExchange = mock();
const listConversations = mock();
const loadConversation = mock();

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/getLLMCompletion', () => ({ getLLMCompletion }));
mock.module(
  '../app.assignment-types.$id/thesis-prompts-library/generator-history.server',
  () => ({ recordExchange, listConversations, loadConversation })
);

const { action, loader } = await import('./route');
const { MAX_GENERATOR_MESSAGES } = await import(
  '../app.assignment-types.$id/thesis-prompts-library/prompt-generator'
);

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

const ROUTE_URL = 'https://example.test/api/domain/thesis-prompt-generator';

function request(messages: unknown, conversationId?: string) {
  const body = new URLSearchParams();
  if (messages !== undefined) {
    body.set(
      'messages',
      typeof messages === 'string' ? messages : JSON.stringify(messages)
    );
  }
  if (conversationId !== undefined) body.set('conversationId', conversationId);
  return new Request(ROUTE_URL, { method: 'POST', body });
}

describe('api.domain.thesis-prompt-generator', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getLLMCompletion.mockReset();
    recordExchange.mockReset();
    listConversations.mockReset();
    loadConversation.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });
    recordExchange.mockResolvedValue(null);
  });

  test('returns the reply and drafted options from the model', async () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({
        reply: 'Here are three drafts about ambition.',
        options: [
          { title: 'Ambition and Its Costs', body: 'Write a…' },
          { title: 'The Price of Power', body: 'Write a…' },
          { title: 'Who Pays for Ambition', body: 'Write a…' },
        ],
      })
    );

    const response = await action({
      request: request([{ role: 'user', content: 'A prompt about ambition.' }]),
    } as never);
    const body = await readBody(response);

    expect(body.success).toBe(true);
    expect(body.reply).toBe('Here are three drafts about ambition.');
    expect(body.options).toHaveLength(3);
    expect(body.options[0].title).toBe('Ambition and Its Costs');
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    const call = getLLMCompletion.mock.calls[0][0];
    expect(call.system).toContain('thesis-driven critical essay');
    expect(call.model).toContain('claude');
    // Three full prompts must fit without truncating the JSON.
    expect(call.maxTokens).toBeGreaterThanOrEqual(4000);
  });

  test('asks the teacher to retry instead of dumping truncated JSON', async () => {
    // A response cut off mid-object (what caused the glitchy raw-JSON bubble).
    getLLMCompletion.mockResolvedValue(
      '{"reply":"Here are three angles","options":[{"title":"The American Dream","body":"Write a thesis-driven critical essay on Death of a Salesman and the'
    );

    const response = await action({
      request: request([{ role: 'user', content: 'Death of a Salesman.' }]),
    } as never);
    const body = await readBody(response);

    expect(body.success).toBe(true);
    expect(body.options).toEqual([]);
    // The teacher must never see the raw JSON.
    expect(body.reply).not.toContain('"reply"');
    expect(body.reply).not.toContain('"options"');
    expect(body.reply).not.toContain('{');
    expect(body.reply.toLowerCase()).toContain('again');
  });

  test('parses JSON that the model wraps in prose or code fences', async () => {
    getLLMCompletion.mockResolvedValue(
      'Sure!\n```json\n{"reply":"What grade level?","options":[]}\n```'
    );

    const response = await action({
      request: request([{ role: 'user', content: 'Something about Macbeth.' }]),
    } as never);
    const body = await readBody(response);

    expect(body).toMatchObject({ success: true, reply: 'What grade level?' });
    expect(body.options).toEqual([]);
  });

  test('coerces a legacy singular prompt into options', () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({
        reply: 'Here is a draft.',
        prompt: { title: 'Fate and Free Will', body: 'Write a…' },
      })
    );

    return action({
      request: request([{ role: 'user', content: 'A prompt about fate.' }]),
    } as never).then(async (response: any) => {
      const body = await readBody(response);
      expect(body.options).toHaveLength(1);
      expect(body.options[0].title).toBe('Fate and Free Will');
    });
  });

  test('falls back to raw text when the model does not return valid JSON', async () => {
    getLLMCompletion.mockResolvedValue('Let me ask: which text are we using?');

    const response = await action({
      request: request([{ role: 'user', content: 'Make me a prompt.' }]),
    } as never);
    const body = await readBody(response);

    expect(body.success).toBe(true);
    expect(body.reply).toBe('Let me ask: which text are we using?');
    expect(body.options).toEqual([]);
  });

  test('rejects students', async () => {
    requireMembership.mockResolvedValue({ id: 'student-1', role: 'STUDENT' });

    const response = await action({
      request: request([{ role: 'user', content: 'Make me a prompt.' }]),
    } as never);

    expect((response as any).init?.status).toBe(403);
    expect((await readBody(response)).success).toBe(false);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('rejects an empty or malformed conversation', async () => {
    const emptyResponse = await action({ request: request([]) } as never);
    expect((emptyResponse as any).init?.status).toBe(400);

    const malformedResponse = await action({
      request: request('not json'),
    } as never);
    expect((malformedResponse as any).init?.status).toBe(400);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('requires the last message to be from the teacher', async () => {
    const response = await action({
      request: request([
        { role: 'user', content: 'A prompt about hope.' },
        { role: 'assistant', content: 'Here you go…' },
      ]),
    } as never);

    expect((response as any).init?.status).toBe(400);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('keeps the forwarded window starting on a teacher message', async () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({ reply: 'Here are three drafts.', options: [] })
    );

    // A long conversation alternates teacher/assistant and always ends on the
    // teacher, so its length is odd. Anthropic rejects a request whose first
    // message is from the assistant, so the trimmed window must never start
    // there no matter how long the history gets.
    for (const teacherTurns of [12, 13, 14, 20]) {
      getLLMCompletion.mockClear();
      const messages: Array<{ role: string; content: string }> = [];
      for (let i = 0; i < teacherTurns; i++) {
        messages.push({ role: 'user', content: `Teacher turn ${i + 1}` });
        if (i < teacherTurns - 1) {
          messages.push({ role: 'assistant', content: `Draft ${i + 1}` });
        }
      }

      const response = await action({ request: request(messages) } as never);
      expect((await readBody(response)).success).toBe(true);

      const forwarded = getLLMCompletion.mock.calls[0][0].messages;
      expect(forwarded[0].role).toBe('user');
      expect(forwarded[forwarded.length - 1].role).toBe('user');
      expect(forwarded.length).toBeLessThanOrEqual(MAX_GENERATOR_MESSAGES);
      // Whatever we keep has to stay a strictly alternating transcript.
      forwarded.forEach((message: { role: string }, index: number) => {
        expect(message.role).toBe(index % 2 === 0 ? 'user' : 'assistant');
      });
    }
  });

  test('surfaces a friendly error when the model call throws', async () => {
    getLLMCompletion.mockRejectedValue(new Error('boom'));

    const response = await action({
      request: request([{ role: 'user', content: 'A prompt about hope.' }]),
    } as never);

    expect((response as any).init?.status).toBe(500);
    expect((await readBody(response)).success).toBe(false);
  });
});

describe('api.domain.thesis-prompt-generator history', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getLLMCompletion.mockReset();
    recordExchange.mockReset();
    listConversations.mockReset();
    loadConversation.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({
        reply: 'Here are three drafts about ambition.',
        options: [{ title: 'Ambition and Its Costs', body: 'Write a…' }],
      })
    );
  });

  test('saves the exchange and returns the conversation id', async () => {
    recordExchange.mockResolvedValue('conv-new');

    const response = await action({
      request: request([{ role: 'user', content: 'A prompt about ambition.' }]),
    } as never);
    const body = await readBody(response);

    expect(body.conversationId).toBe('conv-new');
    expect(recordExchange).toHaveBeenCalledTimes(1);
    expect(recordExchange.mock.calls[0][0]).toEqual({
      conversationId: null,
      membershipId: 'teacher-1',
      teacherMessage: 'A prompt about ambition.',
      reply: 'Here are three drafts about ambition.',
      options: [{ title: 'Ambition and Its Costs', body: 'Write a…' }],
    });
  });

  test('appends to the conversation the client is already in', async () => {
    recordExchange.mockResolvedValue('conv-1');

    await action({
      request: request(
        [
          { role: 'user', content: 'A prompt about ambition.' },
          { role: 'assistant', content: 'Here are three drafts.' },
          { role: 'user', content: 'Make them more about fate.' },
        ],
        'conv-1'
      ),
    } as never);

    const saved = recordExchange.mock.calls[0][0];
    expect(saved.conversationId).toBe('conv-1');
    // Only the newest teacher turn is saved; earlier turns are already stored.
    expect(saved.teacherMessage).toBe('Make them more about fate.');
  });

  test('still answers when saving is unavailable', async () => {
    recordExchange.mockResolvedValue(null);

    const response = await action({
      request: request([{ role: 'user', content: 'A prompt about ambition.' }]),
    } as never);
    const body = await readBody(response);

    expect(body.success).toBe(true);
    expect(body.options).toHaveLength(1);
    expect(body.conversationId).toBeNull();
  });

  test('does not save the truncated-response retry nudge', async () => {
    getLLMCompletion.mockResolvedValue('{"reply": "Here are three dra');

    const response = await action({
      request: request([{ role: 'user', content: 'A prompt about ambition.' }]),
    } as never);
    const body = await readBody(response);

    expect(body.success).toBe(true);
    expect(body.reply).toContain('got tangled on my end');
    expect(recordExchange).not.toHaveBeenCalled();
  });

  test('lists the teacher’s conversations', async () => {
    listConversations.mockResolvedValue([
      { id: 'conv-1', title: 'Macbeth and ambition', updatedAt: 'x', turnCount: 4 },
    ]);

    const response = await loader({ request: new Request(ROUTE_URL) } as never);
    const body = await readBody(response);

    expect(body.success).toBe(true);
    expect(body.conversations).toHaveLength(1);
    expect(listConversations).toHaveBeenCalledWith('teacher-1');
  });

  test('loads one conversation, scoped to the teacher', async () => {
    loadConversation.mockResolvedValue({
      id: 'conv-1',
      title: 'Macbeth and ambition',
      updatedAt: 'x',
      turns: [{ role: 'user', content: 'A prompt about ambition', options: [] }],
    });

    const response = await loader({
      request: new Request(`${ROUTE_URL}?conversationId=conv-1`),
    } as never);
    const body = await readBody(response);

    expect(body.conversation.turns).toHaveLength(1);
    expect(loadConversation).toHaveBeenCalledWith('conv-1', 'teacher-1');
  });

  test('404s a conversation the teacher cannot read', async () => {
    loadConversation.mockResolvedValue(null);

    const response = await loader({
      request: new Request(`${ROUTE_URL}?conversationId=someone-elses`),
    } as never);

    expect((response as any).init?.status).toBe(404);
    expect((await readBody(response)).success).toBe(false);
  });

  test('keeps history teacher-only', async () => {
    requireMembership.mockResolvedValue({ id: 'student-1', role: 'STUDENT' });

    const response = await loader({ request: new Request(ROUTE_URL) } as never);

    expect((response as any).init?.status).toBe(403);
    expect(listConversations).not.toHaveBeenCalled();
  });
});
