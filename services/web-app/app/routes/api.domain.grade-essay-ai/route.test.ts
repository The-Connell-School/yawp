import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { rubricKeys } from '~/domain/grading/rubric';

const prisma = {
  submission: {
    findFirst: mock(),
    update: mock(),
  },
};

const getLLMCompletion = mock();
const isDocumentSubmissionEnabledForScope = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const buildTeacherClassWhere = mock();
const isGradingOwnDocument = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/getLLMCompletion', () => ({ getLLMCompletion }));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForScope,
}));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
  buildTeacherClassWhere,
  isGradingOwnDocument,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast,
}));

const { action } = await import('./route');

function buildRubricResponseJson(
  scoresByKey: Partial<Record<(typeof rubricKeys)[number], number>> = {}
) {
  return JSON.stringify({
    categories: rubricKeys.map((key) => ({
      key,
      score: scoresByKey[key] ?? 3,
      comment: `Comment for ${key}`,
    })),
    overallComment: 'Jordan, this draft has clear progress and focus.',
  });
}

function buildRubricCategoriesJson(
  scoresByKey: Partial<Record<(typeof rubricKeys)[number], number>> = {}
) {
  return JSON.stringify(
    rubricKeys.map((key) => ({
      key,
      score: scoresByKey[key] ?? 3,
      comment: `Comment for ${key}`,
    }))
  );
}

function buildOverallCommentJson() {
  return JSON.stringify({
    overallComment: 'Jordan, this draft has clear progress and focus.',
  });
}

function mockSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    text: 'Frozen AI essay text',
    html: '<p>Frozen AI essay text</p>',
    gradedAt: null,
    document: {
      id: 'doc-1',
      profileId: 'student-profile-1',
      assignment: { class: { schoolId: 'school-1' } },
      studentProfile: { classes: [] },
      profile: { user: { name: 'Jordan Student' } },
    },
    ...overrides,
  };
}

describe('api.domain.grade-essay-ai', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset();
    prisma.submission.update.mockReset();
    getLLMCompletion.mockReset();
    isDocumentSubmissionEnabledForScope.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    buildTeacherClassWhere.mockReset();
    isGradingOwnDocument.mockReset();
    redirectWithToast.mockReset();

    getGradingActor.mockResolvedValue({
      profileId: 'teacher-profile-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    buildTeacherClassWhere.mockReturnValue({});
    isGradingOwnDocument.mockImplementation(
      (actorId: string, docProfileId: string) => actorId === docProfileId
    );
    isDocumentSubmissionEnabledForScope.mockResolvedValue(true);
    redirectWithToast.mockResolvedValue(new Response(null, { status: 302 }));
    prisma.submission.update.mockResolvedValue({ id: 'sub-1' });

    getLLMCompletion
      .mockResolvedValueOnce(buildRubricResponseJson())
      .mockResolvedValueOnce(
        JSON.stringify({
          issues: [
            {
              excerpt: 'Frozen',
              kind: 'error',
              message: 'This phrase needs a stronger verb choice.',
            },
          ],
        })
      );
  });

  test('returns AI suggestions and persists to submission', async () => {
    prisma.submission.findFirst.mockResolvedValue(mockSubmission({ id: 'sub-1' }));

    const form = new FormData();
    form.append('submissionId', 'sub-1');

    const request = new Request(
      'https://example.com/api/domain/grade-essay-ai',
      {
        method: 'POST',
        body: form,
      }
    );

    const response = await action({ request } as any);
    const payload = (response as { data: Record<string, unknown> }).data;

    expect(payload.success).toBe(true);
    expect(payload.message).toBe('Grading Assistant suggestions generated.');
    expect(payload.overallComment).toBe(
      'Jordan, this draft has clear progress and focus.'
    );
    expect(Object.keys(payload.rubricScores ?? {})).toEqual(rubricKeys);
    expect(prisma.submission.update).toHaveBeenCalledTimes(1);
  });

  test('filters submission access through assignment class relation', async () => {
    buildTeacherClassWhere.mockReturnValue({
      assignment: {
        class: {
          teachers: { some: { profileId: 'teacher-profile-1' } },
        },
      },
    });
    prisma.submission.findFirst.mockResolvedValue(mockSubmission({ id: 'sub-1' }));

    const form = new FormData();
    form.append('submissionId', 'sub-1');

    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect(prisma.submission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          document: {
            is: {
              deletedAt: null,
              assignment: {
                class: {
                  teachers: { some: { profileId: 'teacher-profile-1' } },
                },
              },
            },
          },
        }),
      })
    );
  });

  test('checks the document submission flag through student classes for legacy submissions', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        id: 'legacy-sub-1',
        document: {
          id: 'legacy-doc-1',
          profileId: 'student-profile-1',
          assignment: null,
          studentProfile: {
            classes: [{ schoolId: 'scranton-prep-school' }],
          },
          profile: { user: { name: 'Jordan Student' } },
        },
      })
    );

    const form = new FormData();
    form.append('submissionId', 'legacy-sub-1');

    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect(isDocumentSubmissionEnabledForScope).toHaveBeenCalledWith({
      schoolIds: ['scranton-prep-school'],
      classIds: [],
      teacherProfileIds: [],
    });
    expect(redirectWithToast).not.toHaveBeenCalled();
    expect(prisma.submission.update).toHaveBeenCalledTimes(1);
  });

  test('uses the updated rubric instructions in the grading prompt', async () => {
    prisma.submission.findFirst.mockResolvedValue(mockSubmission({ id: 'sub-2' }));

    const form = new FormData();
    form.append('submissionId', 'sub-2');

    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    const firstCallArgs = getLLMCompletion.mock.calls[0]?.[0];
    const prompt = firstCallArgs?.messages?.[0]?.content;

    expect(prompt).toContain('Philosophy Note');
    expect(prompt).toContain('Technical perfection without compelling content');
    expect(prompt).toContain('Thesis/Content (25%)');
    expect(prompt).toContain('Organization/Structure (25%)');
    expect(prompt).toContain('Evidence/Support (20%)');
    expect(prompt).toContain('Voice/Style (20%)');
    expect(prompt).toContain('Grammar/Syntax/Formatting (10%)');
    expect(prompt).toContain(
      'To calculate final grade, multiply each category score by its weight and sum the results.'
    );
  });

  test('returns numeric percentage using the updated category weights', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion
      .mockResolvedValueOnce(
        buildRubricResponseJson({
          thesis_and_content: 5,
          organization_and_structure: 1,
          evidence_and_support: 5,
          voice_and_style: 1,
          grammar_and_mechanics: 1,
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          issues: [
            {
              excerpt: 'Frozen',
              kind: 'error',
              message: 'This phrase needs a stronger verb choice.',
            },
          ],
        })
      );

    prisma.submission.findFirst.mockResolvedValue(mockSubmission({ id: 'sub-3' }));

    const form = new FormData();
    form.append('submissionId', 'sub-3');

    const response = await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);
    const payload = (response as { data: Record<string, unknown> }).data;

    expect(payload.numericPercentage).toBe(77);
    expect(payload.letterGrade).toBe('C');
    expect(payload.score).toBe('77% (C)');
  });

  test('repairs a top-level categories array response from the model', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion
      .mockResolvedValueOnce(buildRubricCategoriesJson())
      .mockResolvedValueOnce(buildOverallCommentJson())
      .mockResolvedValueOnce(
        JSON.stringify({
          issues: [
            {
              excerpt: 'Frozen',
              kind: 'error',
              message: 'This phrase needs a stronger verb choice.',
            },
          ],
        })
      );

    prisma.submission.findFirst.mockResolvedValue(mockSubmission({ id: 'sub-4' }));

    const form = new FormData();
    form.append('submissionId', 'sub-4');

    const response = await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);
    const payload = (response as { data: Record<string, unknown> }).data;

    expect(payload.success).toBe(true);
    expect(payload.overallComment).toBe(
      'Jordan, this draft has clear progress and focus.'
    );
    expect(Object.keys(payload.rubricScores ?? {})).toEqual(rubricKeys);
    expect(getLLMCompletion).toHaveBeenCalledTimes(3);
  });

  test('returns a 502 response when the model returns an empty categories array', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion
      .mockResolvedValueOnce(JSON.stringify([]))
      .mockResolvedValueOnce(JSON.stringify([]));

    prisma.submission.findFirst.mockResolvedValue(mockSubmission({ id: 'sub-5' }));

    const form = new FormData();
    form.append('submissionId', 'sub-5');

    const response = (await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any)) as {
      init?: {
        status?: number;
      };
      data: Record<string, unknown>;
    };

    expect(response.init?.status).toBe(502);
    expect(response.data).toEqual({
      success: false,
      message: 'Grading Assistant returned malformed data. Please try again.',
    });
  });
});
