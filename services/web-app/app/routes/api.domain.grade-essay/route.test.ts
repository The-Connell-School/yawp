import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  documentSnapshot: {
    findMany: mock(),
  },
  document: {
    findMany: mock(),
  },
  grade: {
    upsert: mock(),
  },
};

const isDocumentSubmissionEnabledForSchool = mock();
const isDocumentSubmissionEnabledForSchools = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const buildTeacherClassWhere = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForSchool,
  isDocumentSubmissionEnabledForSchools,
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

describe('api.domain.grade-essay', () => {
  beforeEach(() => {
    prisma.documentSnapshot.findMany.mockReset();
    prisma.document.findMany.mockReset();
    prisma.grade.upsert.mockReset();
    isDocumentSubmissionEnabledForSchool.mockReset();
    isDocumentSubmissionEnabledForSchools.mockReset();
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
    isDocumentSubmissionEnabledForSchool.mockResolvedValue(true);
    isDocumentSubmissionEnabledForSchools.mockResolvedValue(true);
    redirectWithToast.mockResolvedValue(new Response(null, { status: 302 }));
  });

  test('stores frozen snapshot content on grade create and update', async () => {
    prisma.documentSnapshot.findMany.mockResolvedValue([
      {
        id: 'snapshot-1',
        documentId: 'doc-1',
        text: 'Frozen essay text',
        html: '<p>Frozen essay text</p>',
        document: { class: { schoolId: 'school-1' } },
      },
    ]);
    prisma.grade.upsert.mockResolvedValue({ id: 'grade-1' });

    const form = new FormData();
    form.append('snapshotIds', 'snapshot-1');
    form.append('overallComment', 'Nice job.');

    const request = new Request('https://example.com/api/domain/grade-essay', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);

    expect(prisma.grade.upsert).toHaveBeenCalledTimes(1);

    const upsertArg = prisma.grade.upsert.mock.calls[0]?.[0];
    expect(upsertArg).toMatchObject({
      where: { snapshotId: 'snapshot-1' },
      create: {
        snapshotId: 'snapshot-1',
        essayText: 'Frozen essay text',
        essayHtml: '<p>Frozen essay text</p>',
      },
      update: {
        essayText: 'Frozen essay text',
        essayHtml: '<p>Frozen essay text</p>',
      },
    });
  });
});
