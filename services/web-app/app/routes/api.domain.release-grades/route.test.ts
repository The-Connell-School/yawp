import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  grade: {
    findMany: mock(),
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
});
