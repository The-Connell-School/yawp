import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  submission: {
    findMany: mock(),
    updateMany: mock(),
  },
};

const getGradingActor = mock();
const canManageGrades = mock();
const buildTeacherClassWhere = mock();
const isGradingOwnDocument = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
  buildTeacherClassWhere,
  isGradingOwnDocument,
}));

const { action } = await import('./route');

describe('api.domain.release-grades', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.submission.findMany.mockReset();
    prisma.submission.updateMany.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    buildTeacherClassWhere.mockReset();
    isGradingOwnDocument.mockReset();

    getGradingActor.mockResolvedValue({
      membershipId: 'teacher-1',
      teacherProfileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    buildTeacherClassWhere.mockReturnValue({});
    isGradingOwnDocument.mockReturnValue(false);
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma)
    );
  });

  test('releases grades for eligible submissions', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        document: {
          classAssignment: {
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

    expect(prisma.submission.updateMany).toHaveBeenCalledTimes(1);
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
          classAssignment: {
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
          classAssignment: {
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
          classAssignment: {
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

  test('excludes unsubmitted submissions from the eligibility query, closing the grading race on release', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        document: {
          classAssignment: {
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

    const query = prisma.submission.findMany.mock.calls[0][0];
    expect(query.where.unsubmittedAt).toBeNull();
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
