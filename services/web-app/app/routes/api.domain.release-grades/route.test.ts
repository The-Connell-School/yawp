import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  submission: {
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
  isDocumentSubmissionEnabledForSchool: mock(),
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
    prisma.submission.findMany.mockReset();
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
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });
  });

  test('checks school flags from submission.document when releasing', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        document: {
          assignment: {
            class: {
              schoolId: 'school-1',
            },
          },
        },
      },
    ]);

    const form = new FormData();
    form.append('submissionIds', 'sub-1');

    const request = new Request('https://example.com/api/domain/release-grades', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);

    expect(isDocumentSubmissionEnabledForSchools).toHaveBeenCalledWith(['school-1']);
    expect(prisma.submission.updateMany).toHaveBeenCalledTimes(1);
  });

  test('returns 404 when no unreleased submissions found', async () => {
    prisma.submission.findMany.mockResolvedValue([]);

    const form = new FormData();
    form.append('submissionIds', 'sub-nonexistent');

    const request = new Request('https://example.com/api/domain/release-grades', {
      method: 'POST',
      body: form,
    });

    const response = await action({ request } as any);
    const payload = (response as { data: Record<string, unknown>; init?: { status?: number } });
    expect(payload.init?.status).toBe(404);
  });

  test('rejects non-teachers', async () => {
    canManageGrades.mockReturnValue(false);

    const form = new FormData();
    form.append('submissionIds', 'sub-1');

    const request = new Request('https://example.com/api/domain/release-grades', {
      method: 'POST',
      body: form,
    });

    const response = await action({ request } as any);
    const payload = (response as { data: Record<string, unknown>; init?: { status?: number } });
    expect(payload.init?.status).toBe(403);
  });
});
