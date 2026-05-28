import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  submission: {
    findMany: mock(),
    updateMany: mock(),
  },
};

const isDocumentSubmissionEnabledForScope = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const buildTeacherClassWhere = mock();
const isGradingOwnDocument = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
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

describe('api.domain.release-grades', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.submission.findMany.mockReset();
    prisma.submission.updateMany.mockReset();
    isDocumentSubmissionEnabledForScope.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    buildTeacherClassWhere.mockReset();
    isGradingOwnDocument.mockReset();
    redirectWithToast.mockReset();

    getGradingActor.mockResolvedValue({
      profileId: 'teacher-profile-1',
      teacherProfileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    buildTeacherClassWhere.mockReturnValue({});
    isGradingOwnDocument.mockReturnValue(false);
    isDocumentSubmissionEnabledForScope.mockResolvedValue(true);
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma)
    );
  });

  test('checks school flags from submission.document when releasing', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        document: {
          assignment: {
            class: {
              id: 'class-1',
              schoolId: 'school-1',
              school: { organizationId: 'org-1' },
              teachers: [{ id: 'teacher-1' }],
            },
          },
        },
      },
    ]);

    const form = new FormData();
    form.append('submissionIds', 'sub-1');

    const request = new Request(
      'https://example.com/api/domain/release-grades',
      {
        method: 'POST',
        body: form,
      }
    );

    await action({ request } as any);

    expect(isDocumentSubmissionEnabledForScope).toHaveBeenCalledWith({
      schoolIds: ['school-1'],
      organizationIds: ['org-1'],
      classIds: ['class-1'],
      teacherProfileIds: ['teacher-1'],
      classScopes: [
        {
          schoolId: 'school-1',
          organizationId: 'org-1',
          classId: 'class-1',
          teacherProfileIds: ['teacher-1'],
        },
      ],
      actorTeacherProfileId: 'teacher-1',
    });
    expect(prisma.submission.updateMany).toHaveBeenCalledTimes(1);
  });

  test('checks school flags from student classes for legacy submissions when releasing', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 'legacy-sub-1',
        document: {
          assignment: null,
          studentProfile: {
            classes: [
              {
                id: 'legacy-class-1',
                schoolId: 'scranton-prep-school',
                school: { organizationId: 'scranton-org' },
                teachers: [{ id: 'teacher-1' }],
              },
            ],
          },
        },
      },
    ]);

    const form = new FormData();
    form.append('submissionIds', 'legacy-sub-1');

    const request = new Request(
      'https://example.com/api/domain/release-grades',
      {
        method: 'POST',
        body: form,
      }
    );

    await action({ request } as any);

    expect(isDocumentSubmissionEnabledForScope).toHaveBeenCalledWith({
      schoolIds: ['scranton-prep-school'],
      organizationIds: ['scranton-org'],
      classIds: ['legacy-class-1'],
      teacherProfileIds: ['teacher-1'],
      classScopes: [
        {
          schoolId: 'scranton-prep-school',
          organizationId: 'scranton-org',
          classId: 'legacy-class-1',
          teacherProfileIds: ['teacher-1'],
        },
      ],
      actorTeacherProfileId: 'teacher-1',
    });
    expect(prisma.submission.updateMany).toHaveBeenCalledTimes(1);
  });

  test('rejects mixed enabled and disabled submission scopes in the same release request', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 'pilot-submission',
        document: {
          assignment: {
            class: {
              id: 'class-1',
              schoolId: 'school-1',
              school: { organizationId: 'org-1' },
              teachers: [{ id: 'teacher-1' }],
            },
          },
        },
      },
      {
        id: 'non-pilot-submission',
        document: {
          assignment: {
            class: {
              id: 'class-2',
              schoolId: 'school-2',
              school: { organizationId: 'org-2' },
              teachers: [{ id: 'teacher-2' }],
            },
          },
        },
      },
    ]);
    isDocumentSubmissionEnabledForScope.mockImplementation(
      async ({ classIds }) => classIds?.includes('class-1')
    );
    redirectWithToast.mockReturnValue(
      new Response(null, {
        status: 302,
        headers: { Location: '/app/my-classes' },
      })
    );

    const form = new FormData();
    form.append('submissionIds', 'pilot-submission');
    form.append('submissionIds', 'non-pilot-submission');

    const request = new Request(
      'https://example.com/api/domain/release-grades',
      {
        method: 'POST',
        body: form,
      }
    );

    await action({ request } as any);

    expect(isDocumentSubmissionEnabledForScope).toHaveBeenCalledTimes(2);
    expect(isDocumentSubmissionEnabledForScope).toHaveBeenNthCalledWith(1, {
      schoolIds: ['school-1'],
      organizationIds: ['org-1'],
      classIds: ['class-1'],
      teacherProfileIds: ['teacher-1'],
      classScopes: [
        {
          schoolId: 'school-1',
          organizationId: 'org-1',
          classId: 'class-1',
          teacherProfileIds: ['teacher-1'],
        },
      ],
      actorTeacherProfileId: 'teacher-1',
    });
    expect(isDocumentSubmissionEnabledForScope).toHaveBeenNthCalledWith(2, {
      schoolIds: ['school-2'],
      organizationIds: ['org-2'],
      classIds: ['class-2'],
      teacherProfileIds: ['teacher-2'],
      classScopes: [
        {
          schoolId: 'school-2',
          organizationId: 'org-2',
          classId: 'class-2',
          teacherProfileIds: ['teacher-2'],
        },
      ],
      actorTeacherProfileId: 'teacher-1',
    });
    expect(redirectWithToast).toHaveBeenCalledWith('/app/my-classes', {
      description:
        'Grade release is currently disabled for one or more schools.',
      type: 'error',
    });
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  test('returns 404 when no unreleased submissions found', async () => {
    prisma.submission.findMany.mockResolvedValue([]);

    const form = new FormData();
    form.append('submissionIds', 'sub-nonexistent');

    const request = new Request(
      'https://example.com/api/domain/release-grades',
      {
        method: 'POST',
        body: form,
      }
    );

    const response = await action({ request } as any);
    const payload = response as {
      data: Record<string, unknown>;
      init?: { status?: number };
    };
    expect(payload.init?.status).toBe(404);
  });

  test('rejects mixed valid and missing submission IDs without partial release', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        document: {
          assignment: {
            class: {
              id: 'class-1',
              schoolId: 'school-1',
              teachers: [{ id: 'teacher-1' }],
            },
          },
        },
      },
    ]);

    const form = new FormData();
    form.append('submissionIds', 'sub-1');
    form.append('submissionIds', 'missing-sub');

    const request = new Request(
      'https://example.com/api/domain/release-grades',
      {
        method: 'POST',
        body: form,
      }
    );

    const response = await action({ request } as any);
    const payload = response as {
      data: Record<string, unknown>;
      init?: { status?: number };
    };

    expect(payload.init?.status).toBe(404);
    expect(payload.data.message).toBe(
      'One or more submissions are no longer eligible for release.'
    );
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  test('rolls back when concurrent updates release fewer submissions than validated', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        document: {
          assignment: {
            class: {
              id: 'class-1',
              schoolId: 'school-1',
              teachers: [{ id: 'teacher-1' }],
            },
          },
        },
      },
      {
        id: 'sub-2',
        document: {
          assignment: {
            class: {
              id: 'class-1',
              schoolId: 'school-1',
              teachers: [{ id: 'teacher-1' }],
            },
          },
        },
      },
    ]);
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });

    const form = new FormData();
    form.append('submissionIds', 'sub-1');
    form.append('submissionIds', 'sub-2');

    const request = new Request(
      'https://example.com/api/domain/release-grades',
      {
        method: 'POST',
        body: form,
      }
    );

    const response = await action({ request } as any);
    const payload = response as {
      data: Record<string, unknown>;
      init?: { status?: number };
    };

    expect(payload.init?.status).toBe(409);
    expect(payload.data.message).toBe(
      'Submissions changed while releasing grades. Please refresh and try again.'
    );
  });

  test('rejects non-teachers', async () => {
    canManageGrades.mockReturnValue(false);

    const form = new FormData();
    form.append('submissionIds', 'sub-1');

    const request = new Request(
      'https://example.com/api/domain/release-grades',
      {
        method: 'POST',
        body: form,
      }
    );

    const response = await action({ request } as any);
    const payload = response as {
      data: Record<string, unknown>;
      init?: { status?: number };
    };
    expect(payload.init?.status).toBe(403);
  });
});
