import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  submission: { findFirst: mock(), update: mock() },
};

const isDocumentSubmissionEnabledForScope = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const isGradingOwnDocument = mock();
const buildTeacherClassWhere = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForScope,
}));
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
    isDocumentSubmissionEnabledForScope.mockReset();
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
    isDocumentSubmissionEnabledForScope.mockResolvedValue(true);
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

  test('sets gradedAt and gradedById on first grading edit', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
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
        markAsGraded: true,
      }),
    } as any);

    const updateCall = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateCall.data.gradedAt).toBeInstanceOf(Date);
    expect(updateCall.data.gradedByMembershipId).toBe('teacher-1');
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

  test('rejects grading updates when document submission grading is disabled for the submission scope', async () => {
    isDocumentSubmissionEnabledForScope.mockResolvedValue(false);
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedByMembershipId: null,
      document: {
        membershipId: 'student-1',
        assignment: {
          class: {
            id: 'class-1',
            schoolId: 'school-1',
            teachers: [{ id: 'teacher-1' }],
          },
        },
      },
    });

    const response = (await action({
      request: makeRequest({ submissionId: 'sub-1', score: '90% A' }),
    } as any)) as Response;

    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      message:
        'Document submission grading is currently disabled for this school.',
    });
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
