import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getLLMCompletion = mock();

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
// bun's module mocks are global to the test run, so the stub has to keep the
// whole module surface — dropping AgentType breaks other suites that import it.
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: {
    Assistant: 'assistant',
    User: 'user',
  },
  getLLMCompletion,
}));

const { action } = await import('./route');

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
  return new Request(
    'https://example.test/api/domain/daily-pages-prompt-generator',
    { method: 'POST', body }
  );
}

describe('api.domain.daily-pages-prompt-generator', () => {
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
        reply: 'Here are three angles on ambition.',
        options: [
          {
            prompt: 'Ambition always costs someone something. Agree or disagree.',
            type: 'agree-disagree',
            seriousness: 'moderate',
            cognitiveMoves: ['take-a-stance'],
          },
          { prompt: 'Name the last thing you wanted badly. Was it worth it?' },
          { prompt: 'Is there such a thing as wanting too much?' },
        ],
      })
    );

    const response = await action({
      request: request([{ role: 'user', content: 'A prompt about ambition.' }]),
    } as never);
    const body = await readBody(response);

    expect(body.success).toBe(true);
    expect(body.reply).toBe('Here are three angles on ambition.');
    expect(body.options).toHaveLength(3);
    expect(body.options[0]).toMatchObject({
      prompt: 'Ambition always costs someone something. Agree or disagree.',
      type: 'agree-disagree',
      seriousness: 'moderate',
    });
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    const call = getLLMCompletion.mock.calls[0][0];
    expect(call.system).toContain('Daily Pages');
    expect(call.model).toContain('claude');
    // Three options plus the reply must fit without truncating the JSON.
    expect(call.maxTokens).toBeGreaterThanOrEqual(1500);
  });

  test('keeps a draft whose facet tags are outside the vocabulary', async () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({
        reply: 'One draft.',
        options: [{ prompt: 'What do you owe the people who raised you?', type: 'musing' }],
      })
    );

    const response = await action({
      request: request([{ role: 'user', content: 'Something about family.' }]),
    } as never);
    const body = await readBody(response);

    expect(body.options).toHaveLength(1);
    expect(body.options[0].prompt).toBe(
      'What do you owe the people who raised you?'
    );
    expect(body.options[0].type).toBeUndefined();
  });

  test('asks the teacher to retry instead of dumping truncated JSON', async () => {
    // A response cut off mid-object (what produces a glitchy raw-JSON bubble).
    getLLMCompletion.mockResolvedValue(
      '{"reply":"Here are three angles","options":[{"prompt":"The person you are at school is not the'
    );

    const response = await action({
      request: request([{ role: 'user', content: 'Identity.' }]),
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

  test('coerces a legacy singular prompt into options', async () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({
        reply: 'Here is a draft.',
        prompt: { prompt: 'Is loyalty ever a mistake?' },
      })
    );

    const response = await action({
      request: request([{ role: 'user', content: 'A prompt about loyalty.' }]),
    } as never);
    const body = await readBody(response);

    expect(body.options).toHaveLength(1);
    expect(body.options[0].prompt).toBe('Is loyalty ever a mistake?');
  });

  test('falls back to raw text when the model does not return valid JSON', async () => {
    getLLMCompletion.mockResolvedValue('Let me ask: which grade are we writing for?');

    const response = await action({
      request: request([{ role: 'user', content: 'Make me a prompt.' }]),
    } as never);
    const body = await readBody(response);

    expect(body.success).toBe(true);
    expect(body.reply).toBe('Let me ask: which grade are we writing for?');
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

  test('surfaces a friendly error when the model call throws', async () => {
    getLLMCompletion.mockRejectedValue(new Error('boom'));

    const response = await action({
      request: request([{ role: 'user', content: 'A prompt about hope.' }]),
    } as never);

    expect((response as any).init?.status).toBe(500);
    expect((await readBody(response)).success).toBe(false);
  });
});
