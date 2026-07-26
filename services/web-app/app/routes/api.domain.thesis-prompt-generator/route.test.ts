import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getLLMCompletion = mock();

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/getLLMCompletion', () => ({ getLLMCompletion }));

const { action } = await import('./route');
const { MAX_GENERATOR_MESSAGES } = await import(
  '../app.assignment-types.$id/thesis-prompts-library/prompt-generator'
);

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

function request(messages: unknown) {
  const body = new URLSearchParams();
  if (messages !== undefined) {
    body.set(
      'messages',
      typeof messages === 'string' ? messages : JSON.stringify(messages)
    );
  }
  return new Request('https://example.test/api/domain/thesis-prompt-generator', {
    method: 'POST',
    body,
  });
}

describe('api.domain.thesis-prompt-generator', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getLLMCompletion.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });
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
