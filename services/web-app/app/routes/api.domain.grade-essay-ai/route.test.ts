import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { rubricKeys } from '~/domain/grading/rubric';

const prisma = {
  documentSnapshot: {
    findFirst: mock(),
  },
  document: {
    findFirst: mock(),
  },
  grade: {
    upsert: mock(),
  },
};

const getLLMCompletion = mock();
const isDocumentSubmissionEnabledForSchools = mock();
const isDocumentSubmissionEnabledForSchool = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const buildTeacherClassWhere = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/getLLMCompletion', () => ({ getLLMCompletion }));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForSchools,
  isDocumentSubmissionEnabledForSchool,
}));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
  buildTeacherClassWhere,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast,
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

describe('api.domain.grade-essay-ai', () => {
  beforeEach(() => {
    prisma.documentSnapshot.findFirst.mockReset();
    prisma.document.findFirst.mockReset();
    prisma.grade.upsert.mockReset();
    getLLMCompletion.mockReset();
    isDocumentSubmissionEnabledForSchools.mockReset();
    isDocumentSubmissionEnabledForSchool.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    buildTeacherClassWhere.mockReset();
    redirectWithToast.mockReset();

    getGradingActor.mockResolvedValue({
      profileId: 'teacher-profile-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    buildTeacherClassWhere.mockReturnValue({});
    isDocumentSubmissionEnabledForSchools.mockResolvedValue(true);
    isDocumentSubmissionEnabledForSchool.mockResolvedValue(true);
    redirectWithToast.mockResolvedValue(new Response(null, { status: 302 }));

    getLLMCompletion
      .mockResolvedValueOnce(buildRubricResponseJson())
      .mockResolvedValueOnce(JSON.stringify({ issues: [] }));
  });

  test('stores frozen snapshot text/html when writing AI grade suggestions', async () => {
    prisma.documentSnapshot.findFirst.mockResolvedValue({
      id: 'snapshot-1',
      text: 'Frozen AI essay text',
      html: '<p>Frozen AI essay text</p>',
      document: {
        id: 'doc-1',
        class: { schoolId: 'school-1' },
        profile: { user: { name: 'Jordan Student' } },
      },
    });
    prisma.grade.upsert.mockResolvedValue({
      id: 'grade-1',
      grammarIssues: null,
    });

    const form = new FormData();
    form.append('snapshotId', 'snapshot-1');

    const request = new Request(
      'https://example.com/api/domain/grade-essay-ai',
      {
        method: 'POST',
        body: form,
      }
    );

    await action({ request } as any);

    expect(prisma.grade.upsert).toHaveBeenCalledTimes(1);

    const upsertArg = prisma.grade.upsert.mock.calls[0]?.[0];
    expect(upsertArg).toMatchObject({
      where: { snapshotId: 'snapshot-1' },
      create: {
        snapshotId: 'snapshot-1',
        essayText: 'Frozen AI essay text',
        essayHtml: '<p>Frozen AI essay text</p>',
      },
      update: {
        essayText: 'Frozen AI essay text',
        essayHtml: '<p>Frozen AI essay text</p>',
      },
    });
  });
});
