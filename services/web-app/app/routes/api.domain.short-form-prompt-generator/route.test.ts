import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getLLMCompletion = mock();

const prisma = {
  setting: {
    findUnique: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

type ShortFormGeneratorActionBody = {
  success: boolean;
  reply?: string;
  options?: Array<{ prompt: string; kind?: string }>;
  message?: string;
};

function dataWithResponseInitStatus(response: unknown): number | undefined {
  if (response == null || typeof response !== 'object') return undefined;
  return (response as { init?: { status?: number } }).init?.status;
}

async function readBody(response: unknown): Promise<ShortFormGeneratorActionBody> {
  const raw =
    typeof (response as { json?: () => Promise<unknown> }).json === 'function'
      ? await (response as { json: () => Promise<unknown> }).json()
      : (response as { data: unknown }).data;
  return raw as ShortFormGeneratorActionBody;
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
    prisma.setting.findUnique.mockReset();
    process.env.YAWP_ENVIRONMENT = 'demo';

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Holy Family School' },
    });
  });

  test('returns 404 when the feature flag is off', async () => {
    const previous = process.env.YAWP_ENVIRONMENT;
    process.env.YAWP_ENVIRONMENT = 'production';
    prisma.setting.findUnique.mockResolvedValue(null);

    const response = await action({
      request: request([{ role: 'user', content: 'A close read.' }]),
    } as never);

    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(dataWithResponseInitStatus(response)).toBe(404);

    if (previous === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = previous;
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
    expect(call.system.toLowerCase().replace(/\s+/g, ' ')).toContain(
      'depth of thought'
    );
    expect(call.maxTokens).toBeGreaterThanOrEqual(2000);
  });
});
