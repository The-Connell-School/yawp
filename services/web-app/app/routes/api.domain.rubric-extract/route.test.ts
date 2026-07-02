import { beforeEach, describe, expect, mock, test } from 'bun:test';

const anthropic = {
  messages: {
    create: mock(),
  },
};
const prisma = {
  llmLog: {
    create: mock(),
  },
};
const requireAdmin = mock();

mock.module('~/services/anthropic', () => ({ anthropic }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin }));

const { action } = await import('./route');

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

describe('api.domain.rubric-extract', () => {
  beforeEach(() => {
    anthropic.messages.create.mockReset();
    prisma.llmLog.create.mockReset();
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(undefined);
    prisma.llmLog.create.mockResolvedValue({ id: 'log-1' });
  });

  test('extracts rubric fields from pasted text', async () => {
    anthropic.messages.create.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            scoringScale: {
              type: 'weighted_1_5',
              minScore: 1,
              maxScore: 5,
            },
            rubric: {
              categories: [
                {
                  label: 'Organization',
                  weight: 0.5,
                  description: 'Essay is structured clearly.',
                },
                {
                  label: 'Style',
                  weight: 0.5,
                  description: 'Voice and word choice are strong.',
                },
              ],
            },
          }),
        },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const form = new FormData();
    form.set('text', 'Organization 50% Style 50%');

    const response = await action({
      request: new Request('https://example.test/api/domain/rubric-extract', {
        method: 'POST',
        body: form,
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(body.scoringScale.maxScore).toBe(5);
    expect(body.rubric.categories).toHaveLength(2);
    expect(body.rubric.categories[0].label).toBe('Organization');
  });

  test('rejects requests without text or pdf', async () => {
    const response = await action({
      request: new Request('https://example.test/api/domain/rubric-extract', {
        method: 'POST',
        body: new FormData(),
      }),
      params: {},
    } as any);

    const body = await readBody(response);
    expect(body.success).toBe(false);
  });
});
