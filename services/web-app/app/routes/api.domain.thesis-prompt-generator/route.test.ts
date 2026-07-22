import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getLLMCompletion = mock();

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/getLLMCompletion', () => ({ getLLMCompletion }));

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

  test('returns the reply and drafted prompt from the model', async () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({
        reply: 'Here is a draft about ambition.',
        prompt: {
          title: 'Ambition and Its Costs',
          body: 'Write a thesis-driven critical essay on ambition…',
        },
      })
    );

    const response = await action({
      request: request([{ role: 'user', content: 'A prompt about ambition.' }]),
    } as never);
    const body = await readBody(response);

    expect(body).toMatchObject({
      success: true,
      reply: 'Here is a draft about ambition.',
      prompt: {
        title: 'Ambition and Its Costs',
        body: 'Write a thesis-driven critical essay on ambition…',
      },
    });
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    const call = getLLMCompletion.mock.calls[0][0];
    expect(call.system).toContain('thesis-driven critical essay');
    expect(call.model).toContain('claude');
  });

  test('parses JSON that the model wraps in prose or code fences', async () => {
    getLLMCompletion.mockResolvedValue(
      'Sure!\n```json\n{"reply":"What grade level?","prompt":null}\n```'
    );

    const response = await action({
      request: request([{ role: 'user', content: 'Something about Macbeth.' }]),
    } as never);
    const body = await readBody(response);

    expect(body).toMatchObject({
      success: true,
      reply: 'What grade level?',
      prompt: null,
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
    expect(body.prompt).toBeNull();
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
