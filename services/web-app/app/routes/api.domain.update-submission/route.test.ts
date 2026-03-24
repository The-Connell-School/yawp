import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  submission: {
    findFirst: mock(),
    update: mock(),
  },
};

const isDocumentSubmissionEnabledForSchool = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForSchool,
}));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast,
}));

const { action } = await import('./route');

describe('api.domain.update-submission', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset();
    prisma.submission.update.mockReset();
    isDocumentSubmissionEnabledForSchool.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    redirectWithToast.mockReset();

    getGradingActor.mockResolvedValue({
      profileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    isDocumentSubmissionEnabledForSchool.mockResolvedValue(true);
    redirectWithToast.mockResolvedValue(new Response(null, { status: 302 }));
  });

  test('updates grading fields on an existing submission', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedById: null,
      document: { class: { schoolId: 'school-1' } },
    });
    prisma.submission.update.mockResolvedValue({ id: 'sub-1' });

    const form = new FormData();
    form.append('submissionId', 'sub-1');
    form.append('overallComment', 'Great work!');
    form.append('numericPercentage', '85');

    const request = new Request('https://example.com/api/domain/update-submission', {
      method: 'POST',
      body: form,
    });

    const response = await action({ request } as any);
    const payload = (response as any).data;

    expect(payload.success).toBe(true);
    expect(prisma.submission.update).toHaveBeenCalledTimes(1);

    const updateArg = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateArg.where).toEqual({ id: 'sub-1' });
    expect(updateArg.data.overallComment).toBe('Great work!');
    expect(updateArg.data.numericPercentage).toBe(85);
    expect(updateArg.data.letterGrade).toBe('B');
    expect(updateArg.data.gradedAt).toBeInstanceOf(Date);
    expect(updateArg.data.gradedById).toBe('teacher-1');
    expect(updateArg.data.updatedAt).toBeInstanceOf(Date);
  });

  test('does not overwrite gradedAt on subsequent saves', async () => {
    const existingGradedAt = new Date('2026-03-20');
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: existingGradedAt,
      gradedById: 'teacher-1',
      document: { class: { schoolId: 'school-1' } },
    });
    prisma.submission.update.mockResolvedValue({ id: 'sub-1' });

    const form = new FormData();
    form.append('submissionId', 'sub-1');
    form.append('overallComment', 'Updated comment');

    const request = new Request('https://example.com/api/domain/update-submission', {
      method: 'POST',
      body: form,
    });

    await action({ request } as any);

    const updateArg = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateArg.data).not.toHaveProperty('gradedAt');
    expect(updateArg.data).not.toHaveProperty('gradedById');
  });

  test('rejects non-teachers', async () => {
    canManageGrades.mockReturnValue(false);

    const form = new FormData();
    form.append('submissionId', 'sub-1');

    const request = new Request('https://example.com/api/domain/update-submission', {
      method: 'POST',
      body: form,
    });

    const response = await action({ request } as any);
    expect((response as any).init?.status ?? (response as any).status).toBe(403);
  });

  test('returns 404 for non-existent submission', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);

    const form = new FormData();
    form.append('submissionId', 'nonexistent');

    const request = new Request('https://example.com/api/domain/update-submission', {
      method: 'POST',
      body: form,
    });

    const response = await action({ request } as any);
    expect((response as any).init?.status ?? (response as any).status).toBe(404);
  });
});
