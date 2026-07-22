import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getImpersonationState = mock();
const getStudentPreviewState = mock();
const getAssignedPracticeForStudentById = mock();
const getOrCreateStudentPracticeSet = mock();
const getStudentPracticeSet = mock();
const buildMixedStaticPracticeSequence = mock();
const recordWritingPracticeAttempt = mock();
const recordCompositionPracticeAttempt = mock();
const generatePracticeFeedback = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
  getImpersonationState,
}));
mock.module('~/utils/student-preview.server', () => ({
  getStudentPreviewState,
}));
mock.module('~/utils/writing-lessons/practice-assignments.server', () => ({
  buildMixedStaticPracticeSequence,
  getAssignedPracticeForStudentById,
  getOrCreateStudentPracticeSet,
  getStudentPracticeSet,
  recordCompositionPracticeAttempt,
  recordWritingPracticeAttempt,
}));
mock.module('~/utils/writing-lessons/practice-feedback.server', () => ({
  generatePracticeFeedback,
}));

const { action, loader } = await import('./route');

const question = {
  id: 'comma-1',
  sentence: 'The rain stopped, we left.',
  underline: 'stopped, we',
  choices: ['stopped, we', 'stopped; we', 'stopped we', 'stopped, and, we'],
  correctChoiceIndex: 1,
  explanation: 'Use a semicolon.',
};

const compositionPrompt = {
  id: 'topic-sentences-1',
  exercise: 'Rewrite this announcement as an arguable claim.',
  instruction: 'Write one topic sentence.',
};

function request(
  position: number,
  promptId = question.id,
  selectedChoiceIndex = 1
) {
  const body = new URLSearchParams({
    intent: 'answer',
    position: String(position),
    lessonSlug: 'comma-splices',
    promptId,
    selectedChoiceIndex: String(selectedChoiceIndex),
  });
  return new Request(
    'http://localhost/app/writing-lessons/assigned/class-assignment-1',
    { method: 'POST', body }
  );
}

function compositionRequest(response: string, promptId = compositionPrompt.id) {
  const body = new URLSearchParams({
    intent: 'answer',
    kind: 'composition',
    position: '1',
    lessonSlug: 'topic-sentences',
    promptId,
    response,
  });
  return new Request(
    'http://localhost/app/writing-lessons/assigned/class-assignment-1',
    { method: 'POST', body }
  );
}

beforeEach(() => {
  requireUserId.mockReset();
  requireMembership.mockReset();
  getImpersonationState.mockReset().mockResolvedValue({ isReadOnly: false });
  getStudentPreviewState.mockReset().mockResolvedValue({ active: false });
  getAssignedPracticeForStudentById.mockReset();
  getOrCreateStudentPracticeSet.mockReset();
  getStudentPracticeSet.mockReset();
  buildMixedStaticPracticeSequence.mockReset();
  recordWritingPracticeAttempt.mockReset();
  recordCompositionPracticeAttempt.mockReset();
  generatePracticeFeedback.mockReset();

  requireUserId.mockResolvedValue('user-1');
  requireMembership.mockResolvedValue({
    id: 'student-1',
    role: 'STUDENT',
    organization: { id: 'org-1', writingFundamentalsEnabled: true },
  });
  getAssignedPracticeForStudentById.mockResolvedValue({
    id: 'class-assignment-1',
    attempts: [],
    assignment: {
      title: 'Comma week',
      instructions: null,
      dueAt: null,
      lessonSlugs: ['comma-splices'],
      problemCount: 2,
    },
  });
  getStudentPracticeSet.mockResolvedValue([
    {
      position: 1,
      lessonSlug: 'comma-splices',
      lessonTitle: 'Comma Splices',
      question,
    },
  ]);
  recordWritingPracticeAttempt.mockResolvedValue({
    id: 'attempt-1',
    feedbackJson: {
      kind: 'act',
      sentence: question.sentence,
      underline: question.underline,
      choices: question.choices,
      selectedChoiceIndex: 1,
      correctChoiceIndex: 1,
      correct: true,
      explanation: question.explanation,
    },
  });
  generatePracticeFeedback.mockResolvedValue({
    status: 'strong',
    summary: 'Clear and arguable.',
    strengths: ['Specific claim.'],
    focus: ['Support it with evidence.'],
    encouragement: 'Strong work.',
    degraded: false,
  });
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

  test('rejects a different answer replayed at an immutable position', async () => {
    const response = action({
      request: request(1, question.id, 0),
      params: { classAssignmentId: 'class-assignment-1' },
      context: {},
    } as never);

    await expect(response).rejects.toMatchObject({ status: 409 });
  });

  test('initializes a missing set only through the guarded POST intent', async () => {
    getOrCreateStudentPracticeSet.mockResolvedValue([]);
    const body = new URLSearchParams({ intent: 'initialize' });
    const response = await action({
      request: new Request(
        'http://localhost/app/writing-lessons/assigned/class-assignment-1',
        { method: 'POST', body }
      ),
      params: { classAssignmentId: 'class-assignment-1' },
      context: {},
    } as never);

    expect((response as Response).status).toBe(302);
    expect(getOrCreateStudentPracticeSet).toHaveBeenCalledTimes(1);
  });

  test('rejects non-students before assignment lookup or AI admission', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', writingFundamentalsEnabled: true },
    });
    const body = new URLSearchParams({ intent: 'initialize' });

    await expect(
      action({
        request: new Request(
          'http://localhost/app/writing-lessons/assigned/class-assignment-1',
          { method: 'POST', body }
        ),
        params: { classAssignmentId: 'class-assignment-1' },
        context: {},
      } as never)
    ).rejects.toMatchObject({ status: 404 });

    expect(getAssignedPracticeForStudentById).not.toHaveBeenCalled();
    expect(getOrCreateStudentPracticeSet).not.toHaveBeenCalled();
  });

  test('loader is read-only and strips grading secrets from student data', async () => {
    const response = await loader({
      request: new Request(
        'http://localhost/app/writing-lessons/assigned/class-assignment-1'
      ),
      params: { classAssignmentId: 'class-assignment-1' },
      context: {},
    } as never);
    const payload = (response as unknown as { data: { items: unknown } }).data;

    expect(getOrCreateStudentPracticeSet).not.toHaveBeenCalled();
    expect(JSON.stringify(payload.items)).not.toContain('correctChoiceIndex');
    expect(JSON.stringify(payload.items)).not.toContain('explanation');
  });

  test('read-only loader serves static questions without provider or database writes', async () => {
    getStudentPracticeSet.mockResolvedValue(null);
    getImpersonationState.mockResolvedValue({ isReadOnly: true });
    buildMixedStaticPracticeSequence.mockReturnValue([
      {
        position: 1,
        lessonSlug: 'comma-splices',
        lessonTitle: 'Comma Splices',
        question,
      },
    ]);

    const response = await loader({
      request: new Request(
        'http://localhost/app/writing-lessons/assigned/class-assignment-1'
      ),
      params: { classAssignmentId: 'class-assignment-1' },
      context: {},
    } as never);
    const payload = (
      response as { data: { readOnly: boolean; needsInitialization: boolean } }
    ).data;

    expect(payload.readOnly).toBe(true);
    expect(payload.needsInitialization).toBe(false);
    expect(getOrCreateStudentPracticeSet).not.toHaveBeenCalled();
  });

  test('loader restores the durable Composition revision trail in order', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: {
        id: 'org-1',
        writingFundamentalsEnabled: true,
        compositionDrillsEnabled: true,
      },
    });
    const attemptRecord = (revision: number) => ({
      position: 1,
      revision,
      status: revision === 2 ? 'strong' : 'developing',
      feedbackJson: {
        kind: 'composition',
        exercise: compositionPrompt.exercise,
        instruction: compositionPrompt.instruction,
        response: `Draft ${revision}`,
        status: revision === 2 ? 'strong' : 'developing',
        summary: `Feedback ${revision}`,
        strengths: [],
        focus: ['Keep revising.'],
        encouragement: 'Keep going.',
        degraded: false,
      },
    });
    getAssignedPracticeForStudentById.mockResolvedValue({
      id: 'class-assignment-1',
      attempts: [attemptRecord(2), attemptRecord(1)],
      assignment: {
        title: 'Composition practice',
        instructions: null,
        dueAt: null,
        lessonSlugs: ['topic-sentences'],
        problemCount: 1,
      },
    });
    getStudentPracticeSet.mockResolvedValue([
      {
        kind: 'composition',
        position: 1,
        lessonSlug: 'topic-sentences',
        lessonTitle: 'Topic Sentences',
        prompt: compositionPrompt,
      },
    ]);

    const response = await loader({
      request: new Request(
        'http://localhost/app/writing-lessons/assigned/class-assignment-1'
      ),
      params: { classAssignmentId: 'class-assignment-1' },
      context: {},
    } as never);
    const payload = (
      response as unknown as {
        data: {
          compositionDraftsByPosition: Record<
            number,
            Array<{ response: string }>
          >;
        };
      }
    ).data;

    expect(
      payload.compositionDraftsByPosition[1].map((draft) => draft.response)
    ).toEqual(['Draft 1', 'Draft 2']);
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

  test('grades and records a server-owned Composition prompt', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: {
        id: 'org-1',
        writingFundamentalsEnabled: true,
        compositionDrillsEnabled: true,
      },
    });
    getAssignedPracticeForStudentById.mockResolvedValue({
      id: 'class-assignment-1',
      attempts: [],
      assignment: {
        title: 'Composition practice',
        instructions: null,
        dueAt: null,
        lessonSlugs: ['topic-sentences'],
        problemCount: 1,
      },
    });
    getStudentPracticeSet.mockResolvedValue([
      {
        kind: 'composition',
        position: 1,
        lessonSlug: 'topic-sentences',
        lessonTitle: 'Topic Sentences',
        prompt: compositionPrompt,
      },
    ]);

    const response = await action({
      request: compositionRequest(
        'The cafeteria menu fails the students who rely on it most.'
      ),
      params: { classAssignmentId: 'class-assignment-1' },
      context: {},
    } as never);

    expect((response as { data: { recorded: boolean } }).data.recorded).toBe(
      true
    );
    expect(generatePracticeFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        exercise: compositionPrompt.exercise,
        instruction: compositionPrompt.instruction,
      })
    );
    expect(recordCompositionPracticeAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        classAssignmentId: 'class-assignment-1',
        membershipId: 'student-1',
        position: 1,
        prompt: compositionPrompt,
      })
    );
  });

  test('does not persist a blank Composition submission', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: {
        id: 'org-1',
        writingFundamentalsEnabled: true,
        compositionDrillsEnabled: true,
      },
    });
    getAssignedPracticeForStudentById.mockResolvedValue({
      id: 'class-assignment-1',
      attempts: [],
      assignment: {
        lessonSlugs: ['topic-sentences'],
        problemCount: 1,
      },
    });
    getStudentPracticeSet.mockResolvedValue([
      {
        kind: 'composition',
        position: 1,
        lessonSlug: 'topic-sentences',
        lessonTitle: 'Topic Sentences',
        prompt: compositionPrompt,
      },
    ]);

    const response = await action({
      request: compositionRequest('   '),
      params: { classAssignmentId: 'class-assignment-1' },
      context: {},
    } as never);

    expect((response as { data: { recorded: boolean } }).data.recorded).toBe(
      false
    );
    expect(generatePracticeFeedback).not.toHaveBeenCalled();
    expect(recordCompositionPracticeAttempt).not.toHaveBeenCalled();
  });

  test('blocks assigned-practice writes in read-only preview', async () => {
    getStudentPreviewState.mockResolvedValue({ active: true });

    await expect(
      action({
        request: request(1),
        params: { classAssignmentId: 'class-assignment-1' },
        context: {},
      } as never)
    ).rejects.toMatchObject({ status: 403 });
    expect(getAssignedPracticeForStudentById).not.toHaveBeenCalled();
    expect(recordWritingPracticeAttempt).not.toHaveBeenCalled();
  });
});
