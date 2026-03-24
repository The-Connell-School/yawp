import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  grade: {
    findMany: mock(),
    updateMany: mock(),
  },
  submission: {
    updateMany: mock(),
  },
};

const isDocumentSubmissionEnabledForSchools = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const buildTeacherClassWhere = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/feature-flags.server', () => ({
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

describe('api.domain.release-grades', () => {
  beforeEach(() => {
    prisma.grade.findMany.mockReset();
    prisma.grade.updateMany.mockReset();
    prisma.submission.updateMany.mockReset();
    isDocumentSubmissionEnabledForSchools.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    redirectWithToast.mockReset();

    getGradingActor.mockResolvedValue({
      profileId: 'teacher-profile-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    isDocumentSubmissionEnabledForSchools.mockResolvedValue(true);
    prisma.grade.updateMany.mockResolvedValue({ count: 1 });
  });

  test('checks school flags from grade.document when releasing', async () => {
    prisma.grade.findMany.mockResolvedValue([
      {
        id: 'grade-1',
        document: {
          class: {
            schoolId: 'school-1',
          },
        },
      },
    ]);

    const form = new FormData();
    form.append('gradeIds', 'grade-1');

    const request = new Request('https://example.com/api/domain/release-grades', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);

    expect(isDocumentSubmissionEnabledForSchools).toHaveBeenCalledWith(['school-1']);
    expect(prisma.grade.updateMany).toHaveBeenCalledTimes(1);
  });

  test('dual-writes releasedAt to Submission table', async () => {
    prisma.grade.findMany.mockResolvedValue([
      {
        id: 'grade-1',
        snapshotId: 'snapshot-1',
        document: { class: { schoolId: 'school-1' } },
      },
      {
        id: 'grade-2',
        snapshotId: 'snapshot-2',
        document: { class: { schoolId: 'school-1' } },
      },
    ]);
    prisma.grade.updateMany.mockResolvedValue({ count: 2 });
    prisma.submission.updateMany.mockResolvedValue({ count: 2 });

    const form = new FormData();
    form.append('gradeIds', 'grade-1');
    form.append('gradeIds', 'grade-2');

    const request = new Request('https://example.com/api/domain/release-grades', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);

    expect(prisma.submission.updateMany).toHaveBeenCalledTimes(1);
    const updateArg = prisma.submission.updateMany.mock.calls[0]?.[0];
    expect(updateArg.where).toEqual({
      legacySnapshotId: { in: ['snapshot-1', 'snapshot-2'] },
    });
    expect(updateArg.data.releasedAt).toBeInstanceOf(Date);
  });
});
