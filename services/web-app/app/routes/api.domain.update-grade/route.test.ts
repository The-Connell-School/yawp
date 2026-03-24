import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  grade: {
    findFirst: mock(),
    update: mock(),
  },
  submission: {
    update: mock(),
  },
};

const isDocumentSubmissionEnabledForSchool = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const buildTeacherClassWhere = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/feature-flags.server', () => ({
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

describe('api.domain.update-grade', () => {
  beforeEach(() => {
    prisma.grade.findFirst.mockReset();
    prisma.grade.update.mockReset();
    prisma.submission.update.mockReset();
    isDocumentSubmissionEnabledForSchool.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    redirectWithToast.mockReset();

    getGradingActor.mockResolvedValue({
      profileId: 'teacher-profile-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    isDocumentSubmissionEnabledForSchool.mockResolvedValue(true);
  });

  test('checks school flag from grade.document instead of grade.snapshot', async () => {
    prisma.grade.findFirst.mockResolvedValue({
      id: 'grade-1',
      releasedAt: null,
      document: {
        class: {
          schoolId: 'school-1',
        },
      },
    });
    prisma.grade.update.mockResolvedValue({ id: 'grade-1' });

    const form = new FormData();
    form.append('gradeId', 'grade-1');
    form.append('score', 'A');

    const request = new Request('https://example.com/api/domain/update-grade', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);

    expect(isDocumentSubmissionEnabledForSchool).toHaveBeenCalledWith('school-1');
    expect(prisma.grade.update).toHaveBeenCalledTimes(1);
  });

  test('dual-writes update to Submission via legacySnapshotId', async () => {
    prisma.grade.findFirst.mockResolvedValue({
      id: 'grade-1',
      snapshotId: 'snapshot-1',
      releasedAt: null,
      document: { class: { schoolId: 'school-1' } },
    });
    prisma.grade.update.mockResolvedValue({ id: 'grade-1' });
    prisma.submission.update.mockResolvedValue({ id: 'sub-1' });

    const form = new FormData();
    form.append('gradeId', 'grade-1');
    form.append('overallComment', 'Updated feedback');
    form.append('numericPercentage', '75');

    const request = new Request('https://example.com/api/domain/update-grade', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);

    expect(prisma.submission.update).toHaveBeenCalledTimes(1);
    const updateArg = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateArg.where).toEqual({ legacySnapshotId: 'snapshot-1' });
    expect(updateArg.data.overallComment).toBe('Updated feedback');
    expect(updateArg.data.numericPercentage).toBe(75);
  });
});
