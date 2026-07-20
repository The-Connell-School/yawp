import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getLLMCompletion = mock();
const getStudentPreviewState = mock();

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
mock.module('~/utils/student-preview.server', () => ({
  getStudentPreviewState,
  shouldUseStudentExperience: ({
    membershipRole,
    previewActive,
  }: {
    membershipRole: string;
    previewActive: boolean;
  }) => membershipRole === 'STUDENT' || previewActive,
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
    getStudentPreviewState.mockReset().mockResolvedValue({ active: false });

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: {
        id: 'org-1',
        name: 'Org',
        writingFundamentalsEnabled: true,
      },
    });
  });

  test('loads a lesson by direct URL with its ACT questions', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/writing-lessons/revising-for-wordiness'
      ),
      params: { lessonSlug: 'revising-for-wordiness' },
      context: {} as never,
    } as never);

    expect(response.data.lesson.slug).toBe('revising-for-wordiness');
    expect(response.data.actQuestions.length).toBeGreaterThan(0);
    expect(response.data.actQuestions[0].choices).toHaveLength(4);
  });
});

describe('writing lesson practice action - generate-act intent', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset().mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: {
        id: 'org-1',
        name: 'Org',
        writingFundamentalsEnabled: true,
      },
    });
    getLLMCompletion.mockReset();
  });

  const validQuestion = {
    sentence: 'The comet appeared at dawn, observers gasped in wonder.',
    underline: 'dawn, observers',
    choices: [
      'dawn, observers',
      'dawn; observers',
      'dawn observers',
      'dawn, and, observers',
    ],
    correctChoiceIndex: 1,
    explanation: 'A semicolon correctly joins the two independent clauses.',
  };

  test('returns AI ACT questions tagged with generated ids', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({ questions: [validQuestion, validQuestion] })
    );

    const result = (await run({ intent: 'generate-act', count: '2' })) as {
      intent: string;
      questions: Array<{ id: string; correctChoiceIndex: number }>;
    };

    expect(result.intent).toBe('generate-act');
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].id).toContain('fixing-comma-splices-act-gen-');
    expect(result.questions[0].correctChoiceIndex).toBe(1);
  });

  test('degrades to an empty set when generation fails', async () => {
    getLLMCompletion.mockRejectedValueOnce(new Error('no provider'));

    const result = (await run({ intent: 'generate-act', count: '5' })) as {
      intent: string;
      questions: unknown[];
    };

    expect(result.intent).toBe('generate-act');
    expect(result.questions).toEqual([]);
  });

  test('rejects an unsupported intent (grading is client-side)', async () => {
    await expect(run({ intent: 'check', promptId: 'x' })).rejects.toMatchObject(
      { status: 400 }
    );
  });

  test('rejects generated-practice actions while the rollout gate is off', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: {
        id: 'org-1',
        name: 'Org',
        writingFundamentalsEnabled: false,
      },
    });

    await expect(run({ intent: 'generate-act' })).rejects.toMatchObject({
      status: 404,
    });
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });
});
