import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { rubricKeys } from '~/domain/grading/rubric';

const prisma = {
  $transaction: mock(),
  user: { findUnique: mock() },
  submission: {
    findFirst: mock(),
    update: mock(),
  },
  assignment: { findUnique: mock() },
  assignmentType: {
    findUnique: mock(),
  },
  submissionGradingAssistantRun: {
    create: mock(),
  },
  submissionActivity: { create: mock() },
  setting: { findUnique: mock() },
};

const getLLMCompletion = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const buildTeacherClassWhere = mock();
const buildGradeWriteSubjectWhere = mock();
const isGradingOwnDocument = mock();

const actualFetcherResult = await import(
  '~/domain/grading/grading-assistant-fetcher-result'
);
const gradingAssistantResponseHasVisibleContent = mock(() => false);

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: {
    Assistant: 'assistant',
    User: 'user',
  },
  getLLMCompletion,
}));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
  buildTeacherClassWhere,
  buildGradeWriteSubjectWhere,
  isGradingOwnDocument,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast: mock(),
}));
const rateLimitModule = await import('~/utils/rate-limit.server');
mock.module('~/utils/rate-limit.server', () => ({
  ...rateLimitModule,
  enforceGradingLimits: mock(async () => ({ allowed: true })),
}));
mock.module('~/domain/grading/grading-assistant-fetcher-result', () => ({
  ...actualFetcherResult,
  gradingAssistantResponseHasVisibleContent,
}));

const { action } = await import('./route');

function buildRubricResponseJson() {
  return JSON.stringify({
    categories: rubricKeys.map((key) => ({
      key,
      score: 3,
      comment: `Comment for ${key}`,
    })),
    overallComment: 'Jordan, this draft has clear progress and focus.',
  });
}

function mockSubmission() {
  return {
    id: 'sub-empty-visible',
    text: 'Essay text',
    html: '<p>Essay text</p>',
    gradedAt: null,
    updatedAt: new Date('2026-08-20T10:00:00.000Z'),
    releasedAt: null,
    unsubmittedAt: null,
    score: null,
    feedback: null,
    rubricScores: null,
    overallScore: null,
    overallComment: null,
    numericPercentage: null,
    letterGrade: null,
    grammarIssues: null,
    document: {
      id: 'doc-1',
      membershipId: 'student-profile-1',
      assignmentTypeId: 'assignment-type-legacy',
      assignmentType: {
        id: 'assignment-type-legacy',
        kind: null,
        title: 'Critical Essay',
      },
      classAssignment: { class: { schoolId: 'school-1' } },
      membership: {
        organizationId: 'org-1',
        organization: { submissionActivityEnabled: false },
        classesAsStudent: [],
        user: { name: 'Jordan Student' },
      },
    },
  };
}

describe('grade-essay-ai visible content guard', () => {
  beforeEach(() => {
    gradingAssistantResponseHasVisibleContent.mockReset();
    gradingAssistantResponseHasVisibleContent.mockReturnValue(false);
    prisma.submission.findFirst.mockReset();
    prisma.submission.update.mockReset();
    prisma.submissionGradingAssistantRun.create.mockReset();
    prisma.$transaction.mockReset();
    getLLMCompletion.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    buildTeacherClassWhere.mockReset();
    buildGradeWriteSubjectWhere.mockReset().mockReturnValue({});
    isGradingOwnDocument.mockReset();

    getGradingActor.mockResolvedValue({
      membershipId: 'teacher-1',
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    buildTeacherClassWhere.mockReturnValue({});
    prisma.submission.findFirst.mockResolvedValue(mockSubmission());
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'assignment-type-legacy',
      title: 'Critical Essay',
      kind: null,
      scoringScaleJson: null,
      rubricJson: null,
      gradingPromptConfigJson: null,
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 1,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
    });
    prisma.$transaction.mockImplementation(async (callback: unknown) =>
      (callback as (tx: typeof prisma) => Promise<unknown>)(prisma)
    );

    getLLMCompletion
      .mockResolvedValueOnce(buildRubricResponseJson())
      .mockResolvedValueOnce(JSON.stringify({ issues: [] }));
  });

  test('does not persist when assembled output has no visible suggestions', async () => {
    const form = new FormData();
    form.append('submissionId', 'sub-empty-visible');

    const response = (await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as never)) as {
      init?: { status?: number };
      data: Record<string, unknown>;
    };

    expect(response.init?.status).toBe(502);
    expect(response.data).toEqual({
      success: false,
      message: 'Grading Assistant returned no suggestions. Please try again.',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.submission.update).not.toHaveBeenCalled();
    expect(prisma.submissionGradingAssistantRun.create).not.toHaveBeenCalled();
    expect(gradingAssistantResponseHasVisibleContent).toHaveBeenCalled();
  });
});
