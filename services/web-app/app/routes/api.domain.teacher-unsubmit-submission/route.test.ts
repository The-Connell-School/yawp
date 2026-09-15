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
const buildTeacherDocumentAccessWhere = mock();
const isGradingOwnDocument = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
  buildTeacherClassWhere,
  buildTeacherDocumentAccessWhere,
  isGradingOwnDocument,
}));

const { action } = await import('./route');

function submissionFixture(
  id: string,
  overrides: Partial<{
    gradedAt: Date | null;
    releasedAt: Date | null;
    numericPercentage: number | null;
    overallScore: number | null;
    score: string | null;
  }> = {}
) {
  return {
    id,
    updatedAt: new Date('2026-09-15T12:00:00.000Z'),
    gradedAt: null,
    releasedAt: null,
    unsubmittedAt: null,
    numericPercentage: null,
    overallScore: null,
    score: null,
    document: {
      membershipId: 'student-1',
      membership: {
        userId: 'student-user-1',
        organizationId: 'org-1',
      },
      classAssignment: {
        class: {
          school: { organizationId: 'org-1' },
        },
      },
    },
    ...overrides,
  };
}

describe('api.domain.teacher-unsubmit-submission', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.user.findMany.mockReset();
    prisma.submission.findMany.mockReset();
    prisma.submission.updateMany.mockReset();
    prisma.submissionActivity.createMany.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    buildTeacherClassWhere.mockReset();
    buildTeacherDocumentAccessWhere.mockReset();
    isGradingOwnDocument.mockReset();

    prisma.user.findMany.mockResolvedValue([
      {
        id: 'teacher-user-1',
        name: 'Teacher One',
        email: 'teacher@example.test',
      },
    ]);
    prisma.submissionActivity.createMany.mockResolvedValue({ count: 1 });
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma)
    );
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
      classAssignment: {
        class: { teachers: { some: { id: 'teacher-1' } } },
      },
    });
    buildTeacherDocumentAccessWhere.mockImplementation(
      ({
        membershipId,
        organizationId,
      }: {
        membershipId: string;
        organizationId: string;
      }) => ({
        OR: [
          {
            classAssignment: {
              class: {
                school: { organizationId },
                teachers: { some: { id: membershipId, isActive: true } },
              },
            },
          },
          {
            classAssignment: { is: null },
            membership: {
              is: {
                organizationId,
                classesAsStudent: {
                  some: {
                    school: { organizationId },
                    teachers: { some: { id: membershipId, isActive: true } },
                  },
                },
              },
            },
          },
        ],
      })
    );
    isGradingOwnDocument.mockReturnValue(false);
  });

  test('unsubmits selected submissions and records one activity per row', async () => {
    prisma.submission.findMany.mockResolvedValue([
      submissionFixture('sub-1'),
      submissionFixture('sub-2', {
        gradedAt: new Date('2026-09-15T10:00:00.000Z'),
        releasedAt: new Date('2026-09-15T11:00:00.000Z'),
        numericPercentage: 88,
        overallScore: 4,
        score: '88/100',
      }),
    ]);
    prisma.submission.updateMany.mockResolvedValue({ count: 2 });

    const form = new FormData();
    form.append('submissionIds', 'sub-1');
    form.append('submissionIds', 'sub-2');

    const response = await action({
      request: new Request(
        'https://example.com/api/domain/teacher-unsubmit-submission',
        { method: 'POST', body: form }
      ),
    } as any);

    expect((response as any).data.success).toBe(true);
    expect((response as any).data.message).toContain('2 submissions withdrawn');
    expect(prisma.submission.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.submission.updateMany.mock.calls[0][0].where.id).toEqual({
      in: ['sub-1', 'sub-2'],
    });
    expect(prisma.submissionActivity.createMany).toHaveBeenCalledTimes(1);
    expect(
      prisma.submissionActivity.createMany.mock.calls[0][0].data.map(
        (entry: any) => ({
          submissionId: entry.submissionId,
          eventType: entry.eventType,
          priorStatus: entry.metadata.priorStatus,
        })
      )
    ).toEqual([
      {
        submissionId: 'sub-1',
        eventType: 'submission.unsubmitted',
        priorStatus: 'submitted',
      },
      {
        submissionId: 'sub-2',
        eventType: 'submission.unsubmitted',
        priorStatus: 'released',
      },
    ]);
  });

  test('keeps the previous single-submission form payload working', async () => {
    prisma.submission.findMany.mockResolvedValue([submissionFixture('sub-1')]);

    const form = new FormData();
    form.append('submissionId', 'sub-1');

    await action({
      request: new Request(
        'https://example.com/api/domain/teacher-unsubmit-submission',
        { method: 'POST', body: form }
      ),
    } as any);

    expect(prisma.submission.findMany.mock.calls[0][0].where.id).toEqual({
      in: ['sub-1'],
    });
    expect(prisma.submission.updateMany).toHaveBeenCalledTimes(1);
  });

  test('rejects mixed valid and missing IDs without a partial unsubmit', async () => {
    prisma.submission.findMany.mockResolvedValue([submissionFixture('sub-1')]);

    const form = new FormData();
    form.append('submissionIds', 'sub-1');
    form.append('submissionIds', 'missing-sub');

    const response = await action({
      request: new Request(
        'https://example.com/api/domain/teacher-unsubmit-submission',
        { method: 'POST', body: form }
      ),
    } as any);

    expect((response as any).init?.status).toBe(404);
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
    expect(prisma.submissionActivity.createMany).not.toHaveBeenCalled();
  });
});
