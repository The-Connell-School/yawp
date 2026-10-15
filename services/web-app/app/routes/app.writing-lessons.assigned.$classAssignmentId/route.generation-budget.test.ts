import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test';

// Keep the assignment helper, generators and admission implementation real.
// Stub authentication, database/lease and provider boundaries only.
const requireUserId = mock();
const requireMembership = mock();
const promptSet = { findUnique: mock(), create: mock() };
const assignment = { findFirst: mock() };
const attempt = { create: mock() };
const organization = { findUnique: mock() };
const assertFreeTierSpendAllowed = mock();
const getLLMCompletion = mock();
const isFreeTierEnabled = mock();
const isAiUnlocked = mock();
const withSingleFlight = mock();
class FreeTierSpendGuardDeniedError extends Error {}

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/db.server', () => ({
  prisma: {
    writingPracticeClassAssignment: assignment,
    writingPracticePromptSet: promptSet,
    writingPracticeAttempt: attempt,
    organization,
  },
}));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));
mock.module('~/utils/rate-limit.server', () => ({ withSingleFlight }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
}));
mock.module('~/domain/free-tier/is-ai-unlocked.server', () => ({
  isAiUnlocked,
}));
mock.module('~/domain/free-tier/usage-budget.server', () => ({
  assertFreeTierSpendAllowed,
  FreeTierSpendGuardDeniedError,
}));
const { loader, action } = await import('./route');
const budgetMessage =
  'Writing tools are paused because this free-tier environment has reached its current budget.';
const stored = [
  {
    kind: 'composition',
    position: 1,
    lessonSlug: 'topic-sentences',
    lessonTitle: 'Topic Sentences',
    prompt: {
      id: 'p1',
      exercise: 'A claim.',
      instruction: 'Write a topic sentence.',
    },
  },
];

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('u1');
  requireMembership
    .mockReset()
    .mockResolvedValue({ id: 'm1', organization: { id: 'org1' } });
  assignment.findFirst.mockReset().mockResolvedValue({
    id: 'ca1',
    attempts: [],
    assignment: {
      title: 'Assigned practice',
      lessonSlugs: ['topic-sentences'],
      problemCount: 1,
      instructions: null,
      dueAt: null,
    },
  });
  promptSet.findUnique.mockReset().mockResolvedValue(null);
  promptSet.create
    .mockReset()
    .mockImplementation(async ({ data }) => ({
      promptsJson: data.promptsJson,
    }));
  attempt.create.mockReset();
  organization.findUnique
    .mockReset()
    .mockResolvedValue({ id: 'org1', plan: 'FREE_CLASSROOM' });
  isFreeTierEnabled.mockReset().mockResolvedValue(true);
  isAiUnlocked.mockReset().mockResolvedValue(true);
  assertFreeTierSpendAllowed
    .mockReset()
    .mockRejectedValue(new FreeTierSpendGuardDeniedError());
  getLLMCompletion
    .mockReset()
    .mockResolvedValue(
      JSON.stringify({
        prompts: [
          {
            exercise: 'Turn the lunch menu announcement into a claim.',
            instruction: 'Write a topic sentence.',
          },
        ],
      })
    );
  withSingleFlight
    .mockReset()
    .mockImplementation(async (_key, fn) => ({ ran: true, value: await fn() }));
});
afterAll(() => mock.restore());

function run(mode: 'loader' | 'action') {
  const request =
    mode === 'loader'
      ? new Request('http://localhost/app/writing-lessons/assigned/ca1')
      : new Request('http://localhost/app/writing-lessons/assigned/ca1', {
          method: 'POST',
          body: new URLSearchParams({
            kind: 'composition',
            position: '1',
            lessonSlug: 'topic-sentences',
            promptId: 'p1',
            response: 'A new claim about lunch.',
          }),
        });
  return (mode === 'loader' ? loader : action)({
    request,
    params: { classAssignmentId: 'ca1' },
    context: {},
  } as never) as Promise<any>;
}
function expectNoOutput() {
  expect(getLLMCompletion).not.toHaveBeenCalled();
  expect(promptSet.create).not.toHaveBeenCalled();
  expect(attempt.create).not.toHaveBeenCalled();
}

describe('assigned first-open generation admission', () => {
  for (const mode of ['loader', 'action'] as const) {
    test(`${mode} denies first-time generation before provider work or saved output`, async () => {
      const result = await run(mode);
      expect(result.init?.status).toBe(402);
      expect(result.data).toMatchObject({
        error: 'free_tier_budget_exceeded',
        message: budgetMessage,
      });
      expect(assertFreeTierSpendAllowed).toHaveBeenCalledTimes(1);
      expectNoOutput();
    });
    test(`${mode} handles a classroom whose AI is still locked`, async () => {
      isAiUnlocked.mockResolvedValue(false);
      const result = await run(mode);
      expect(result.init?.status).toBe(403);
      expect(result.data).toMatchObject({ error: 'ai_locked' });
      expect(assertFreeTierSpendAllowed).not.toHaveBeenCalled();
      expectNoOutput();
    });
    test(`${mode} denies generation after the single-flight winner never saves`, async () => {
      withSingleFlight.mockResolvedValue({ ran: false });
      const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((
        fn: any
      ) => {
        fn();
        return 0 as any;
      }) as typeof setTimeout);
      try {
        const result = await run(mode);
        expect(result.init?.status).toBe(402);
        expect(result.data).toMatchObject({ message: budgetMessage });
        expect(assertFreeTierSpendAllowed).toHaveBeenCalledTimes(1);
        expectNoOutput();
      } finally {
        timer.mockRestore();
      }
    });
  }
  test('existing sets remain readable with an exhausted budget', async () => {
    promptSet.findUnique.mockResolvedValue({ promptsJson: stored });
    const result = await run('loader');
    expect(result.data.items).toMatchObject(stored);
    expect(assertFreeTierSpendAllowed).not.toHaveBeenCalled();
    expectNoOutput();
  });
  test('a losing caller reads the winner saved set without generation admission', async () => {
    withSingleFlight.mockResolvedValue({ ran: false });
    promptSet.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ promptsJson: stored });
    const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: any
    ) => {
      fn();
      return 0 as any;
    }) as typeof setTimeout);
    try {
      const result = await run('loader');
      expect(result.data.items).toMatchObject(stored);
      expect(assertFreeTierSpendAllowed).not.toHaveBeenCalled();
      expectNoOutput();
    } finally {
      timer.mockRestore();
    }
  });
  test('below-budget generation admits before the provider and persists the set', async () => {
    assertFreeTierSpendAllowed.mockImplementation(async () => {
      expect(getLLMCompletion).not.toHaveBeenCalled();
      expect(promptSet.create).not.toHaveBeenCalled();
    });
    const result = await run('loader');
    expect(result.data.items).toHaveLength(1);
    expect(assertFreeTierSpendAllowed).toHaveBeenCalledTimes(1);
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    expect(promptSet.create).toHaveBeenCalledTimes(1);
  });
  test('paid plans keep generating without free-tier budget checks or new reservations', async () => {
    organization.findUnique.mockResolvedValue({ id: 'org1', plan: 'PAID' });
    const result = await run('loader');
    expect(result.data.items).toHaveLength(1);
    expect(assertFreeTierSpendAllowed).not.toHaveBeenCalled();
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    expect(promptSet.create).toHaveBeenCalledTimes(1);
  });
});
