import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getAssignedPracticeForStudentById = mock();
const getOrCreateStudentPracticeSet = mock();
const recordCompositionPracticeAttempt = mock();
const recordWritingPracticeAttempt = mock();
const generatePracticeFeedback = mock();
const reserveAiRequest = mock();

class MockAiRateLimitError extends Error {
  retryAfterSeconds = 60;
}
class MockAiFreeTierBudgetExceededError extends Error {}

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/writing-lessons/practice-assignments.server', () => ({
  getAssignedPracticeForStudentById,
  getOrCreateStudentPracticeSet,
  recordCompositionPracticeAttempt,
  recordWritingPracticeAttempt,
}));
mock.module('~/utils/writing-lessons/practice-feedback.server', () => ({
  generatePracticeFeedback,
}));
mock.module('~/utils/ai-admission.server', () => ({
  AiFreeTierBudgetExceededError: MockAiFreeTierBudgetExceededError,
  AiRateLimitError: MockAiRateLimitError,
  AiLockedForFreeTierError: class extends Error {},
  aiLockedForFreeTierMessage: () => "AI tools are locked pending administrator approval.",
  aiFreeTierBudgetExceededMessage: () =>
    'Writing tools are paused because this free-tier environment has reached its current budget.',
  reserveAiRequest,
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

function buildRequest(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request('https://example.test/app/writing-lessons/assigned/ca-1', {
    method: 'POST',
    body,
  });
}

describe('assigned writing practice action', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset().mockResolvedValue({
      id: 'student-1',
      organization: { id: 'org-1' },
    });
    getAssignedPracticeForStudentById.mockReset().mockResolvedValue({
      id: 'ca-1',
      assignment: {
        lessonSlugs: ['topic-sentences'],
        problemCount: 1,
      },
    });
    getOrCreateStudentPracticeSet.mockReset().mockResolvedValue([
      {
        kind: 'composition',
        position: 1,
        lessonSlug: 'topic-sentences',
        lessonTitle: 'Topic Sentences',
        prompt: {
          id: 'topic-sentences-1',
          exercise: 'Rewrite this announcement as a claim.',
          instruction: 'Write a topic sentence.',
        },
      },
    ]);
    recordCompositionPracticeAttempt.mockReset();
    recordWritingPracticeAttempt.mockReset();
    generatePracticeFeedback.mockReset();
    reserveAiRequest.mockReset().mockResolvedValue(undefined);
  });

  test('denies composition feedback when the free-tier AI budget is exhausted', async () => {
    reserveAiRequest.mockImplementation(() => {
      throw new MockAiFreeTierBudgetExceededError();
    });

    const response = (await action({
      request: buildRequest({
        kind: 'composition',
        lessonSlug: 'topic-sentences',
        position: '1',
        promptId: 'topic-sentences-1',
        response: 'The cafeteria menu makes lunch least fair for students.',
      }),
      params: { classAssignmentId: 'ca-1' },
      context: {} as never,
    } as any)) as any;

    expect(response.init?.status).toBe(402);
    expect(response.data).toMatchObject({
      kind: 'composition',
      recorded: false,
      feedback: {
        summary:
          'Writing tools are paused because this free-tier environment has reached its current budget.',
      },
    });
    expect(generatePracticeFeedback).not.toHaveBeenCalled();
    expect(recordCompositionPracticeAttempt).not.toHaveBeenCalled();
  });
});
