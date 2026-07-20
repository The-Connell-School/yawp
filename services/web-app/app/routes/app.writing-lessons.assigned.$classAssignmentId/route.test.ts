import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getAssignedPracticeForStudentById = mock();
const getOrCreateStudentPracticeSet = mock();
const recordWritingPracticeAttempt = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/writing-lessons/practice-assignments.server', () => ({
  getAssignedPracticeForStudentById,
  getOrCreateStudentPracticeSet,
  recordWritingPracticeAttempt,
}));

const { action } = await import('./route');

const question = {
  id: 'comma-1',
  sentence: 'The rain stopped, we left.',
  underline: 'stopped, we',
  choices: ['stopped, we', 'stopped; we', 'stopped we', 'stopped, and, we'],
  correctChoiceIndex: 1,
  explanation: 'Use a semicolon.',
};

function request(position: number, promptId = question.id) {
  const body = new URLSearchParams({
    position: String(position),
    lessonSlug: 'comma-splices',
    promptId,
    selectedChoiceIndex: '1',
  });
  return new Request(
    'http://localhost/app/writing-lessons/assigned/class-assignment-1',
    { method: 'POST', body }
  );
}

beforeEach(() => {
  requireUserId.mockReset();
  requireMembership.mockReset();
  getAssignedPracticeForStudentById.mockReset();
  getOrCreateStudentPracticeSet.mockReset();
  recordWritingPracticeAttempt.mockReset();

  requireUserId.mockResolvedValue('user-1');
  requireMembership.mockResolvedValue({
    id: 'student-1',
    role: 'STUDENT',
    organization: { id: 'org-1', writingFundamentalsEnabled: true },
  });
  getAssignedPracticeForStudentById.mockResolvedValue({
    id: 'class-assignment-1',
    assignment: {
      lessonSlugs: ['comma-splices'],
      problemCount: 2,
    },
  });
  getOrCreateStudentPracticeSet.mockResolvedValue([
    {
      position: 1,
      lessonSlug: 'comma-splices',
      lessonTitle: 'Comma Splices',
      question,
    },
  ]);
  recordWritingPracticeAttempt.mockResolvedValue({ id: 'attempt-1' });
});

describe('assigned writing practice action', () => {
  test('persists the immutable sequence position for a valid answer', async () => {
    const response = await action({
      request: request(1),
      params: { classAssignmentId: 'class-assignment-1' },
      context: {},
    } as never);

    expect((response as { data: { recorded: boolean } }).data.recorded).toBe(
      true
    );
    expect(recordWritingPracticeAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        classAssignmentId: 'class-assignment-1',
        membershipId: 'student-1',
        position: 1,
        question,
      })
    );
  });

  test('rejects a prompt replayed under a different sequence position', async () => {
    await expect(
      action({
        request: request(2),
        params: { classAssignmentId: 'class-assignment-1' },
        context: {},
      } as never)
    ).rejects.toMatchObject({ status: 400 });
    expect(recordWritingPracticeAttempt).not.toHaveBeenCalled();
  });

  test('rejects a direct assigned-practice URL while the rollout gate is off', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingFundamentalsEnabled: false },
    });

    await expect(
      action({
        request: request(1),
        params: { classAssignmentId: 'class-assignment-1' },
        context: {},
      } as never)
    ).rejects.toMatchObject({ status: 404 });
    expect(getAssignedPracticeForStudentById).not.toHaveBeenCalled();
  });
});
