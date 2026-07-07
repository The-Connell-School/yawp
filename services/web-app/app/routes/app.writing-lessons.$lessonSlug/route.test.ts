import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getLLMCompletion = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/db.server', () => ({
  prisma: { class: { findMany: mock() } },
}));
// Mock the leaf LLM call (not the generation/feedback modules) so this test
// never clobbers the module-as-subject in the generation/feedback unit tests.
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));

const { action, loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

function buildRequest(fields: Record<string, string | string[]>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((item) => body.append(key, item));
    else body.append(key, value);
  }
  return new Request(
    'http://localhost/app/writing-lessons/fixing-comma-splices',
    { method: 'POST', body }
  );
}

async function run(fields: Record<string, string | string[]>) {
  const response = await action({
    request: buildRequest(fields),
    params: { lessonSlug: 'fixing-comma-splices' },
    context: {},
  } as never);
  return (response as unknown as { data?: unknown }).data ?? response;
}

describe('writing lesson detail route', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getLLMCompletion.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org' },
    });
  });

  test('loads a lesson by direct URL', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/writing-lessons/revising-for-wordiness'
      ),
      params: { lessonSlug: 'revising-for-wordiness' },
      context: {} as never,
    } as never);

    expect(response.data.lesson.slug).toBe('revising-for-wordiness');
    expect(response.data.practicePrompts.length).toBeGreaterThan(0);
  });
});

describe('writing lesson practice action - generate intent', () => {
  test('returns AI prompts tagged with generated ids', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        prompts: [
          { exercise: 'The band played, the crowd sang.', instruction: 'Fix.' },
          { exercise: 'It rained, we stayed home.', instruction: 'Fix.' },
        ],
      })
    );

    const result = (await run({ intent: 'generate', count: '2' })) as {
      intent: string;
      prompts: Array<{ id: string; exercise: string }>;
    };

    expect(result.intent).toBe('generate');
    expect(result.prompts).toHaveLength(2);
    expect(result.prompts[0].id).toContain('fixing-comma-splices-gen-');
    expect(result.prompts[0].exercise).toContain('band played');
  });

  test('degrades to an empty set when generation fails', async () => {
    getLLMCompletion.mockRejectedValueOnce(new Error('no provider'));

    const result = (await run({ intent: 'generate', count: '5' })) as {
      intent: string;
      prompts: unknown[];
    };

    expect(result.intent).toBe('generate');
    expect(result.prompts).toEqual([]);
  });
});

describe('writing lesson practice action - check intent', () => {
  test('grades a static prompt looked up by id', async () => {
    getLLMCompletion.mockRejectedValueOnce(new Error('offline'));

    const result = (await run({
      intent: 'check',
      promptId: 'fixing-comma-splices-1',
      response: 'The album dropped; fans went wild.',
    })) as { promptId: string; feedback: { degraded: boolean } };

    expect(result.promptId).toBe('fixing-comma-splices-1');
    expect(result.feedback.degraded).toBe(true);
  });

  test('grades a generated prompt using the exercise the client carries', async () => {
    getLLMCompletion.mockRejectedValueOnce(new Error('offline'));

    const result = (await run({
      intent: 'check',
      promptId: 'fixing-comma-splices-gen-abc123',
      exercise: 'She sang, the crowd cheered.',
      instruction: 'Fix the comma splice.',
      response: 'She sang; the crowd cheered.',
    })) as { promptId: string; feedback: { degraded: boolean } };

    expect(result.promptId).toBe('fixing-comma-splices-gen-abc123');
    expect(result.feedback.degraded).toBe(true);
  });

  test('rejects a generated prompt that arrives without its exercise', async () => {
    await expect(
      run({
        intent: 'check',
        promptId: 'fixing-comma-splices-gen-missing',
        response: 'Whatever.',
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
