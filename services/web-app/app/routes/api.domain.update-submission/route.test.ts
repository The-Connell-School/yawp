import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  submission: { findFirst: mock(), updateMany: mock() },
  submissionActivity: { create: mock() },
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

const UNSUBMITTED_BEFORE_GRADED_MESSAGE =
  'This submission was unsubmitted before you could grade it. Please refresh the page.';

function makeRequest(body: Record<string, unknown>) {
  return new Request('https://example.com/api/domain/update-submission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('api.domain.update-submission', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.submission.findFirst.mockReset();
    prisma.submission.updateMany.mockReset();
    prisma.submissionActivity.create.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    isGradingOwnDocument.mockReset();
    buildTeacherClassWhere.mockReset();

    getGradingActor.mockResolvedValue({
      membershipId: 'teacher-1',
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    isGradingOwnDocument.mockImplementation(
      (actorId: string, docMembershipId: string) => actorId === docMembershipId
    );
    buildTeacherClassWhere.mockReturnValue({});
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma)
    );
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
      numericPercentage: null,
      unsubmittedAt: null,
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
    expect(prisma.submission.updateMany).toHaveBeenCalledTimes(1);
    const updateCall = prisma.submission.updateMany.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'sub-1', unsubmittedAt: null });
    expect(updateCall.data.score).toBe('85% B');
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
      numericPercentage: null,
      unsubmittedAt: null,
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });

    const response = (await action({
      request: makeRequest({ submissionId: 'sub-1', grammarIssues }),
    } as any)) as Response;

    const body = await response.json();
    const updateCall = prisma.submission.updateMany.mock.calls[0]?.[0];
    expect(body.success).toBe(true);
    expect(updateCall.data.grammarIssues).toEqual(grammarIssues);
  });

  test('sets gradedAt and gradedById on first grading edit with overall percentage', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
      numericPercentage: null,
      unsubmittedAt: null,
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });

    await action({
      request: makeRequest({
        submissionId: 'sub-1',
        score: '90% A',
        numericPercentage: 90,
        markAsGraded: true,
      }),
    } as any);

    const updateCall = prisma.submission.updateMany.mock.calls[0]?.[0];
    expect(updateCall.data.gradedAt).toBeInstanceOf(Date);
    expect(updateCall.data.gradedByMembershipId).toBe('teacher-1');
  });

  test('rejects markAsGraded without an overall percentage', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
      numericPercentage: null,
      unsubmittedAt: null,
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
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  test('marks a points-scale submission graded, which records points and no percentage', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
      numericPercentage: null,
      overallScore: 2,
      score: '2/3',
      unsubmittedAt: null,
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

    expect(response.status).toBe(200);
    const updateCall = prisma.submission.updateMany.mock.calls[0][0];
    expect(updateCall.data.gradedAt).toBeInstanceOf(Date);
  });

  test('marks graded when the points grade arrives in the same request', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
      numericPercentage: null,
      overallScore: null,
      score: null,
      unsubmittedAt: null,
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
        overallScore: 0,
        score: '0/3',
      }),
    } as any)) as Response;

    expect(response.status).toBe(200);
  });

  test('does not overwrite gradedAt on subsequent edits', async () => {
    const existingGradedAt = new Date('2026-01-01');
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: existingGradedAt,
      gradedByMembershipId: 'teacher-1',
      numericPercentage: 90,
      unsubmittedAt: null,
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });

    await action({
      request: makeRequest({ submissionId: 'sub-1', feedback: 'Updated' }),
    } as any);

    const updateCall = prisma.submission.updateMany.mock.calls[0]?.[0];
    expect(updateCall.data.gradedAt).toBeUndefined();
    expect(updateCall.data.gradedByMembershipId).toBeUndefined();
  });

  test('atomically records exact before/after activity when a released grade is edited', async () => {
    const releasedAt = new Date('2026-08-01T15:30:00.000Z');
    const updatedAt = new Date('2026-08-01T15:31:00.000Z');
    const transactionActivityCreate = mock().mockResolvedValue({
      id: 'activity-1',
    });
    prisma.$transaction.mockImplementationOnce(async (callback: any) =>
      callback({
        submission: prisma.submission,
        submissionActivity: { create: transactionActivityCreate },
      })
    );
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: new Date('2026-07-31T14:00:00.000Z'),
      gradedByMembershipId: 'teacher-1',
      releasedAt,
      updatedAt,
      score: '85% B',
      feedback: 'Strong opening.',
      numericPercentage: 85,
      overallScore: 85,
      unsubmittedAt: null,
      document: {
        membershipId: 'student-1',
        assignment: null,
        classAssignment: {
          class: {
            id: 'class-1',
            schoolId: 'school-1',
            school: { organizationId: 'org-1' },
            teachers: [{ id: 'teacher-1' }],
          },
        },
        membership: {
          organizationId: 'org-1',
          organization: { submissionActivityEnabled: true },
          classesAsStudent: [],
        },
      },
    });

    const response = (await action({
      request: makeRequest({
        submissionId: 'sub-1',
        score: '92% A-',
        feedback: 'Stronger evidence and analysis.',
      }),
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionActivityCreate).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();

    const activity = transactionActivityCreate.mock.calls[0][0].data;
    expect(activity).toEqual(
      expect.objectContaining({
        submissionId: 'sub-1',
        organizationId: 'org-1',
        actorMembershipId: 'teacher-1',
        occurredAfterRelease: true,
        changes: {
          score: { before: '85% B', after: '92% A-' },
          feedback: {
            before: 'Strong opening.',
            after: 'Stronger evidence and analysis.',
          },
        },
      })
    );
    expect(activity.eventType).toEqual(expect.any(String));
    expect(activity.source).toEqual(expect.any(String));

    const updateCall = prisma.submission.updateMany.mock.calls[0][0];
    expect(updateCall.data.releasedAt).toBeUndefined();
    expect(updateCall.where.updatedAt).toEqual(updatedAt);
  });

  test('keeps released submissions read-only when the organization rollout is off', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      updatedAt: new Date('2026-08-01T15:31:00.000Z'),
      gradedAt: new Date('2026-08-01T15:00:00.000Z'),
      gradedByMembershipId: 'teacher-1',
      releasedAt: new Date('2026-08-01T15:30:00.000Z'),
      score: '85% B',
      feedback: 'Before',
      numericPercentage: 85,
      overallScore: 85,
      unsubmittedAt: null,
      document: {
        membershipId: 'student-1',
        assignment: null,
        classAssignment: null,
        membership: {
          organizationId: 'org-1',
          organization: { submissionActivityEnabled: false },
          classesAsStudent: [],
        },
      },
    });

    const response = (await action({
      request: makeRequest({ submissionId: 'sub-1', score: '92% A-' }),
    } as any)) as Response;

    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });

  test('suppresses no-op updates and activity', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      updatedAt: new Date('2026-08-01T15:31:00.000Z'),
      gradedAt: new Date('2026-08-01T15:00:00.000Z'),
      gradedByMembershipId: 'teacher-1',
      releasedAt: null,
      score: '85% B',
      feedback: 'Before',
      numericPercentage: 85,
      overallScore: 85,
      unsubmittedAt: null,
      document: {
        membershipId: 'student-1',
        assignment: null,
        classAssignment: null,
        membership: {
          organizationId: 'org-1',
          organization: { submissionActivityEnabled: false },
          classesAsStudent: [],
        },
      },
    });

    const response = (await action({
      request: makeRequest({ submissionId: 'sub-1', score: '85% B' }),
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });

  test('assigns gradedByMembershipId when marking an already graded submission', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: new Date('2026-01-01'),
      gradedByMembershipId: null,
      numericPercentage: 85,
      unsubmittedAt: null,
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });

    await action({
      request: makeRequest({
        submissionId: 'sub-1',
        markAsGraded: true,
      }),
    } as any);

    const updateCall = prisma.submission.updateMany.mock.calls[0]?.[0];
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
      numericPercentage: null,
      unsubmittedAt: null,
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
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
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

  // ── Grading race: a student unsubmits while the teacher has the grading
  // screen open. The save must be refused, not silently applied. ──────────

  test('refuses to save a grade when the submission was already unsubmitted', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
      numericPercentage: null,
      unsubmittedAt: new Date('2026-08-08T12:00:00Z'),
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });

    const response = (await action({
      request: makeRequest({
        submissionId: 'sub-1',
        score: '90% A',
        numericPercentage: 90,
        markAsGraded: true,
      }),
    } as any)) as Response;

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe(UNSUBMITTED_BEFORE_GRADED_MESSAGE);
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  test('refuses a draft field save (not just markAsGraded) once unsubmitted', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
      numericPercentage: null,
      unsubmittedAt: new Date('2026-08-08T12:00:00Z'),
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });

    const response = (await action({
      request: makeRequest({ submissionId: 'sub-1', feedback: 'Nice work' }),
    } as any)) as Response;

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.message).toBe(UNSUBMITTED_BEFORE_GRADED_MESSAGE);
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  test('closes the race: refuses when unsubmit lands between the read and the write', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
      numericPercentage: null,
      unsubmittedAt: null,
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });
    // Simulates the student's unsubmit winning the race: the guarded
    // updateMany matches zero rows even though the initial read looked safe.
    prisma.submission.updateMany.mockResolvedValue({ count: 0 });

    const response = (await action({
      request: makeRequest({ submissionId: 'sub-1', score: '90% A' }),
    } as any)) as Response;

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe(UNSUBMITTED_BEFORE_GRADED_MESSAGE);
  });

  test('enforces the guard inside the same transaction/predicate style as unsubmit', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
      numericPercentage: null,
      unsubmittedAt: null,
      document: {
        membershipId: 'student-1',
        assignment: null,
        membership: { classesAsStudent: [] },
      },
    });

    await action({
      request: makeRequest({ submissionId: 'sub-1', score: '90% A' }),
    } as any);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const updateCall = prisma.submission.updateMany.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'sub-1', unsubmittedAt: null });
  });
});
