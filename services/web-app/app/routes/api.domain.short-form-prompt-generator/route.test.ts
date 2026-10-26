import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getLLMCompletion = mock();
const teacherPromptGeneratorDisabledResponse = mock();

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));
mock.module('~/domain/teacher-prompt-generator/gate.server', () => ({
  teacherPromptGeneratorDisabledResponse,
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

async function readBody(response: unknown) {
  return typeof (response as { json?: () => Promise<unknown> }).json ===
    'function'
    ? (response as { json: () => Promise<unknown> }).json()
    : (response as { data: unknown }).data;
}

function request(messages: unknown) {
  const body = new URLSearchParams();
  body.set(
    'messages',
    typeof messages === 'string' ? messages : JSON.stringify(messages)
  );
  return new Request(
    'https://example.test/api/domain/short-form-prompt-generator',
    { method: 'POST', body }
  );
}

describe('api.domain.short-form-prompt-generator', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getLLMCompletion.mockReset();
    teacherPromptGeneratorDisabledResponse.mockReset();
    teacherPromptGeneratorDisabledResponse.mockResolvedValue(null);

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Holy Family School' },
    });
  });

  test('returns 404 when the feature flag is off', async () => {
    teacherPromptGeneratorDisabledResponse.mockResolvedValue({
      data: { success: false, message: 'off' },
      init: { status: 404 },
    });

    const response = await action({
      request: request([{ role: 'user', content: 'A close read.' }]),
    } as never);

    expect(getLLMCompletion).not.toHaveBeenCalled();
    const status =
      (response as { init?: { status?: number } }).init?.status ??
      (response as Response).status;
    expect(status).toBe(404);
  });

  test('returns drafted short-form options from the model', async () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({
        reply: 'Three gradable angles.',
        options: [
          {
            prompt: 'Explain one line you underlined today.',
            kind: 'close-read',
            sourceNeed: 'required',
            lengthTarget: 'paragraph',
          },
        ],
      })
    );

    const response = await action({
      request: request([{ role: 'user', content: 'After a close read.' }]),
    } as never);
    const body = await readBody(response);

    expect(body.success).toBe(true);
    expect(body.options[0].kind).toBe('close-read');
    const call = getLLMCompletion.mock.calls[0][0];
    expect(call.system.toLowerCase()).toContain('depth of thought');
    expect(call.maxTokens).toBeGreaterThanOrEqual(2000);
  });
});
