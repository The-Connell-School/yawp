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
});

describe('writing lesson practice action - check-composition intent', () => {
  async function runComposition(
    fields: Record<string, string | string[]>,
    lessonSlug = 'topic-sentences'
  ) {
    const response = await action({
      request: buildRequest(fields),
      params: { lessonSlug },
      context: {},
    } as never);
    return (response as unknown as { data?: any }).data ?? response;
  }

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
    process.env.COMPOSITION_PRACTICE_ENABLED = 'true';
  });

  afterAll(() => {
    delete process.env.COMPOSITION_PRACTICE_ENABLED;
  });

  test('a blank response is caught by the guardrail before the tutor', async () => {
    const result = (await runComposition({
      intent: 'check-composition',
      promptId: 'topic-sentences-1',
      exercise: 'Rewrite this announcement as a claim.',
      instruction: 'Write a topic sentence.',
      response: '',
    })) as {
      intent: string;
      promptId: string;
      feedback: { status: string; summary: string; degraded: boolean };
    };

    expect(result.intent).toBe('check-composition');
    expect(result.promptId).toBe('topic-sentences-1');
    expect(result.feedback.status).toBe('needs_revision');
    expect(result.feedback.summary).toMatch(/add your revision/i);
    // The guardrail is deterministic — the tutor is never called.
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('a real response returns offline-degraded tutor feedback', async () => {
    getLLMCompletion.mockRejectedValueOnce(new Error('tutor offline'));

    const result = (await runComposition({
      intent: 'check-composition',
      promptId: 'topic-sentences-1',
      exercise: 'Rewrite this announcement as a claim.',
      instruction: 'Write a topic sentence.',
      response:
        'The cafeteria menu punishes the students who most need a real lunch.',
    })) as { feedback: { degraded: boolean; summary: string } };

    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    expect(result.feedback.degraded).toBe(true);
    expect(result.feedback.summary).toMatch(/tutor is offline/i);
  });

  test('a configured tutor produces graded, non-degraded feedback', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        status: 'strong',
        summary: 'This lands as a clear, arguable claim.',
        strengths: ['You made a specific claim a paragraph can prove.'],
        focus: ['Make sure the rest of the paragraph delivers on it.'],
        encouragement: 'Nice work — keep that edge.',
      })
    );

    const result = (await runComposition({
      intent: 'check-composition',
      promptId: 'topic-sentences-2',
      exercise: 'Turn this fact into a claim.',
      instruction: 'Write a topic sentence.',
      response:
        'The new skate park has quietly become the town’s only free hangout.',
    })) as { feedback: { degraded: boolean; status: string } };

    expect(result.feedback.degraded).toBe(false);
    expect(result.feedback.status).toBe('strong');
  });

  test('is rejected when the composition flag is off', async () => {
    process.env.COMPOSITION_PRACTICE_ENABLED = 'false';
    await expect(
      runComposition({
        intent: 'check-composition',
        promptId: 'topic-sentences-1',
        response: 'a real revision attempt',
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
