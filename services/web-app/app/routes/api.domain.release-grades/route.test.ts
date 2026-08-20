import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  user: { findMany: mock() },
  submission: {
    findMany: mock(),
    updateMany: mock(),
  },
  submissionActivity: { createMany: mock() },
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
    prisma.user.findMany.mockReset();
    prisma.submission.findMany.mockReset();
    prisma.submission.updateMany.mockReset();
    prisma.submissionActivity.createMany.mockReset();
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'teacher-user-1',
        name: 'Teacher One',
        email: 'teacher@example.test',
      },
    ]);
    prisma.submissionActivity.createMany.mockResolvedValue({ count: 1 });
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    buildTeacherClassWhere.mockReset();
    isGradingOwnDocument.mockReset();

    getGradingActor.mockResolvedValue({
      userId: 'teacher-user-1',
      membershipId: 'teacher-1',
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    buildTeacherClassWhere.mockReturnValue({
      OR: [
        {
          classAssignment: {
            class: { teachers: { some: { id: 'teacher-1' } } },
          },
        },
      ],
    });
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
        releasedAt: null,
        document: {
          membership: { organizationId: 'org-1' },
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
    expect(prisma.submissionActivity.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        submissionId: 'sub-1',
        organizationId: 'org-1',
        actorMembershipId: 'teacher-1',
        eventType: 'submission.grade_released',
        occurredAfterRelease: false,
      }),
    ]);
    expect(
      prisma.submission.findMany.mock.calls[0][0].where.document.is.AND[1]
    ).toEqual(expect.objectContaining({ OR: expect.any(Array) }));
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

  test('rejects oversized release batches before opening a transaction', async () => {
    const form = new FormData();
    for (let index = 0; index < 501; index += 1) {
      form.append('submissionIds', `sub-${index}`);
    }

    const response = await action({
      request: new Request('https://example.com/api/domain/release-grades', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect((response as any).init?.status).toBe(422);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('records exactly one release event for each submission in a batch', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        releasedAt: null,
        document: { membership: { organizationId: 'org-1' } },
      },
      {
        id: 'sub-2',
        releasedAt: null,
        document: { membership: { organizationId: 'org-1' } },
      },
    ]);
    prisma.submission.updateMany.mockResolvedValue({ count: 2 });
    const form = new FormData();
    form.append('submissionIds', 'sub-1');
    form.append('submissionIds', 'sub-2');

    const response = await action({
      request: new Request('https://example.com/api/domain/release-grades', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect((response as any).data.releasedCount).toBe(2);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.createMany).toHaveBeenCalledTimes(1);
    expect(
      prisma.submissionActivity.createMany.mock.calls[0][0].data.map(
        (entry: any) => entry.submissionId
      )
    ).toEqual(['sub-1', 'sub-2']);
  });

  test('releases the 500-submission maximum with one actor lookup and one batch insert', async () => {
    const submissions = Array.from({ length: 500 }, (_, index) => ({
      id: `sub-${index}`,
      releasedAt: null,
      document: { membership: { organizationId: 'org-1' } },
    }));
    prisma.submission.findMany.mockResolvedValue(submissions);
    prisma.submission.updateMany.mockResolvedValue({ count: 500 });
    prisma.submissionActivity.createMany.mockResolvedValue({ count: 500 });

    const form = new FormData();
    for (const submission of submissions) {
      form.append('submissionIds', submission.id);
    }

    const response = await action({
      request: new Request('https://example.com/api/domain/release-grades', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect((response as any).data.releasedCount).toBe(500);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.createMany).toHaveBeenCalledTimes(1);
    expect(
      prisma.submissionActivity.createMany.mock.calls[0][0].data
    ).toHaveLength(500);
  });

  test('rejects a mixed authorized and cross-tenant batch before any write', async () => {
    // The tenant-scoped eligibility query can resolve only the authorized row.
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        releasedAt: null,
        document: { membership: { organizationId: 'org-1' } },
      },
    ]);
    const form = new FormData();
    form.append('submissionIds', 'sub-1');
    form.append('submissionIds', 'cross-org-sub');

    const response = await action({
      request: new Request('https://example.com/api/domain/release-grades', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect((response as any).init?.status).toBe(404);
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
    expect(prisma.submissionActivity.createMany).not.toHaveBeenCalled();
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
    expect(prisma.submissionActivity.createMany).not.toHaveBeenCalled();
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
