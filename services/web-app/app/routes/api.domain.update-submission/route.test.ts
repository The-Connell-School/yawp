import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  submission: { findFirst: mock(), update: mock() },
};

const getGradingActor = mock();
const canManageGrades = mock();
const isGradingOwnDocument = mock();
const buildTeacherClassWhere = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
  isGradingOwnDocument,
  buildTeacherClassWhere,
}));

const { action } = await import('./route');

function makeRequest(body: Record<string, unknown>) {
  return new Request('https://example.com/api/domain/update-submission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('api.domain.update-submission', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset();
    prisma.submission.update.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    isGradingOwnDocument.mockReset();
    buildTeacherClassWhere.mockReset();

    getGradingActor.mockResolvedValue({
      membershipId: 'teacher-1',
      teacherProfileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    isGradingOwnDocument.mockImplementation(
      (actorId: string, docMembershipId: string) => actorId === docMembershipId
    );
    buildTeacherClassWhere.mockReturnValue({});
  });

  test('updates grading fields on a submission', async () => {
    buildTeacherClassWhere.mockReturnValue({
      OR: [
        {
          classAssignment: {
            class: {
              teachers: { some: { id: 'teacher-1' } },
            },
          },
        },
        {
          membership: {
            classesAsStudent: {
              some: {
                teachers: { some: { id: 'teacher-1' } },
              },
            },
          },
        },
      ],
    });
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: new Date(),
      gradedByMembershipId: 'teacher-1',
      document: {
        membershipId: 'student-1',
        assignment: {
          submitForGrade: true,
          pointValue: 100,
        },
        classAssignment: {
          class: {
            id: 'class-1',
            schoolId: 'school-1',
            school: { organizationId: 'org-1' },
            teachers: [{ id: 'teacher-1' }],
          },
        },
        membership: {
          classesAsStudent: [],
        },
      },
    });
    prisma.submission.update.mockResolvedValue({
      id: 'sub-1',
      score: '85% B',
      feedback: 'Great work',
    });

    const response = (await action({
      request: makeRequest({
        submissionId: 'sub-1',
        score: '85% B',
        feedback: 'Great work',
      }),
    } as any)) as Response;

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.submission.score).toBe('85% B');
    expect(prisma.submission.update).toHaveBeenCalledTimes(1);
    expect(prisma.submission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'sub-1',
          document: {
            is: expect.objectContaining({
              deletedAt: null,
              OR: expect.arrayContaining([
                expect.objectContaining({
                  membership: expect.any(Object),
                }),
              ]),
            }),
          },
        }),
      })
    );
  });

  test('persists grammar issue updates for teacher-managed submissions', async () => {
    const grammarIssues = [
      {
        id: 'grammar-1',
        kind: 'style',
        message: 'Consider a stronger verb.',
        start: 12,
        end: 18,
      },
    ];
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: new Date(),
      gradedByMembershipId: 'teacher-1',
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });
    prisma.submission.update.mockResolvedValue({ id: 'sub-1', grammarIssues });

    const response = (await action({
      request: makeRequest({ submissionId: 'sub-1', grammarIssues }),
    } as any)) as Response;

    const body = await response.json();
    const updateCall = prisma.submission.update.mock.calls[0]?.[0];
    expect(body.success).toBe(true);
    expect(updateCall.data.grammarIssues).toEqual(grammarIssues);
  });

  test('sets gradedAt and gradedById on first grading edit with overall percentage', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
      numericPercentage: null,
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });
    prisma.submission.update.mockResolvedValue({ id: 'sub-1', score: '90% A' });

    await action({
      request: makeRequest({
        submissionId: 'sub-1',
        score: '90% A',
        numericPercentage: 90,
        markAsGraded: true,
      }),
    } as any);

    const updateCall = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateCall.data.gradedAt).toBeInstanceOf(Date);
    expect(updateCall.data.gradedByMembershipId).toBe('teacher-1');
  });

  test('rejects markAsGraded without an overall percentage', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
      numericPercentage: null,
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });

    const response = (await action({
      request: makeRequest({
        submissionId: 'sub-1',
        markAsGraded: true,
      }),
    } as any)) as Response;

    expect(response.status).toBe(400);
    expect(prisma.submission.update).not.toHaveBeenCalled();
  });

  test('does not overwrite gradedAt on subsequent edits', async () => {
    const existingGradedAt = new Date('2026-01-01');
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: existingGradedAt,
      gradedByMembershipId: 'teacher-1',
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });
    prisma.submission.update.mockResolvedValue({ id: 'sub-1' });

    await action({
      request: makeRequest({ submissionId: 'sub-1', feedback: 'Updated' }),
    } as any);

    const updateCall = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateCall.data.gradedAt).toBeUndefined();
    expect(updateCall.data.gradedByMembershipId).toBeUndefined();
  });

  test('assigns gradedByMembershipId when marking an already graded submission', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: new Date('2026-01-01'),
      gradedByMembershipId: null,
      numericPercentage: 85,
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });
    prisma.submission.update.mockResolvedValue({ id: 'sub-1' });

    await action({
      request: makeRequest({
        submissionId: 'sub-1',
        markAsGraded: true,
      }),
    } as any);

    const updateCall = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateCall.data.gradedAt).toBeUndefined();
    expect(updateCall.data.gradedByMembershipId).toBe('teacher-1');
  });

  test('rejects non-teachers', async () => {
    canManageGrades.mockReturnValue(false);

    const response = (await action({
      request: makeRequest({ submissionId: 'sub-1', score: '100' }),
    } as any)) as Response;

    expect(response.status).toBe(403);
  });

  test('rejects grading own submission', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
      document: {
        membershipId: 'teacher-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });

    const response = (await action({
      request: makeRequest({ submissionId: 'sub-1', score: '90% A' }),
    } as any)) as Response;

    expect(response.status).toBe(403);
    expect(prisma.submission.update).not.toHaveBeenCalled();
  });

  test('returns 404 when submission not found', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);

    const response = (await action({
      request: makeRequest({ submissionId: 'nonexistent' }),
    } as any)) as Response;

    expect(response.status).toBe(404);
  });

  test('returns 400 when submissionId missing', async () => {
    const response = (await action({
      request: makeRequest({ score: '100' }),
    } as any)) as Response;

    expect(response.status).toBe(400);
  });
});
