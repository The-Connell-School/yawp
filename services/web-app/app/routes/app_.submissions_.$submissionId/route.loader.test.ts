import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findUnique: mock() },
  submission: { findFirst: mock() },
  submissionActivity: { findMany: mock() },
  assignmentType: { findUnique: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast: (to: string, payload: unknown) =>
    new Response(JSON.stringify({ to, payload }), {
      status: 302,
      headers: { 'Content-Type': 'application/json' },
    }),
}));
const { loader: routeLoader } = await import('./route');
const loader = routeLoader as any;

const STUDENT_MEMBERSHIP_ID = 'membership-student';
const TEACHER_MEMBERSHIP_ID = 'membership-teacher';

function membership(
  id: string,
  role: 'STUDENT' | 'TEACHER',
  organizationId = 'org-1'
) {
  return { id, role, organization: { id: organizationId } };
}

function buildSubmission(
  overrides: { unsubmittedAt?: Date | null } = {}
): Record<string, unknown> {
  return {
    id: 'sub-1',
    title: 'Essay',
    text: 'body',
    html: '<p>body</p>',
    submittedAt: new Date('2026-08-01T00:00:00Z'),
    score: null,
    feedback: null,
    rubricScores: null,
    overallScore: null,
    overallComment: null,
    numericPercentage: null,
    letterGrade: null,
    grammarIssues: null,
    promptConfig: null,
    aiMeta: null,
    releasedAt: null,
    gradedAt: null,
    gradedByMembershipId: null,
    archivedAt: null,
    unsubmittedAt: null,
    documentId: 'doc-1',
    document: {
      id: 'doc-1',
      title: 'Essay',
      assignmentTypeId: 'at-1',
      assignment: null,
      classAssignment: {
        class: {
          id: 'class-1',
          schoolId: 'school-1',
          school: { organizationId: 'org-1' },
          teachers: [{ id: TEACHER_MEMBERSHIP_ID }],
        },
      },
      membership: {
        id: STUDENT_MEMBERSHIP_ID,
        organizationId: 'org-1',
        organization: { submissionActivityEnabled: true },
        userId: 'user-student',
        user: { name: 'Student' },
        classesAsStudent: [
          {
            id: 'class-1',
            schoolId: 'school-1',
            school: { organizationId: 'org-1' },
            teachers: [{ id: TEACHER_MEMBERSHIP_ID }],
          },
        ],
      },
    },
    comments: [],
    gradingAssistantRuns: [],
    ...overrides,
  };
}

function request() {
  return new Request('https://example.test/app/submissions/sub-1');
}

async function readRedirect(result: unknown) {
  return (await (result as Response).json()) as {
    to: string;
    payload: { description: string; type: string };
  };
}

describe('submission loader — unsubmitted redirect', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.submission.findFirst.mockReset();
    prisma.submissionActivity.findMany.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    prisma.assignmentType.findUnique.mockReset();

    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.assignmentType.findUnique.mockResolvedValue(null);
    prisma.submissionActivity.findMany.mockResolvedValue([]);
    requireUserId.mockResolvedValue('user-student');
  });

  // Only one actor can set Submission.unsubmittedAt: the owning student, via
  // /api/domain/unsubmit-submission, which 403s teachers and admins. The
  // message must therefore be in the student's own frame.
  test('tells the student they unsubmitted it themselves', async () => {
    requireMembership.mockResolvedValue(
      membership(STUDENT_MEMBERSHIP_ID, 'STUDENT')
    );
    prisma.submission.findFirst.mockResolvedValue(
      buildSubmission({ unsubmittedAt: new Date('2026-08-02T00:00:00Z') })
    );

    const result = await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    });
    const redirect = await readRedirect(result);

    expect(redirect.to).toBe('/app/documents/doc-1');
    expect(redirect.payload.description).toBe(
      'You unsubmitted this document. You can revise and resubmit it.'
    );
    expect(redirect.payload.type).toBe('message');
    expect(redirect.payload.description).not.toContain('teacher');
  });

  test('does not redirect the owning student when the submission is still active', async () => {
    requireMembership.mockResolvedValue(
      membership(STUDENT_MEMBERSHIP_ID, 'STUDENT')
    );
    prisma.submission.findFirst.mockResolvedValue(buildSubmission());

    const result = await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    });

    expect(result).not.toBeInstanceOf(Response);
    expect((result as { isOwner: boolean }).isOwner).toBe(true);
  });

  test('does not redirect a teacher viewing an unsubmitted submission', async () => {
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue(
      membership(TEACHER_MEMBERSHIP_ID, 'TEACHER')
    );
    prisma.submission.findFirst.mockResolvedValue(
      buildSubmission({ unsubmittedAt: new Date('2026-08-02T00:00:00Z') })
    );

    const result = await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    });

    expect(result).not.toBeInstanceOf(Response);
    expect((result as { isTeacher: boolean }).isTeacher).toBe(true);
  });

  test('loads newest-first tenant-scoped activity for staff only', async () => {
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue(
      membership(TEACHER_MEMBERSHIP_ID, 'TEACHER')
    );
    prisma.submission.findFirst.mockResolvedValue(buildSubmission());
    prisma.submissionActivity.findMany.mockResolvedValue([
      {
        id: 'activity-1',
        eventType: 'submission.grade_updated',
        source: 'update-submission',
        occurredAfterRelease: true,
        changes: { score: { before: '85% B', after: '92% A-' } },
        metadata: null,
        createdAt: new Date('2026-08-20T12:00:00.000Z'),
        actorMembership: {
          user: { name: 'Teacher One', email: 'teacher@example.test' },
        },
      },
    ]);

    const result = (await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    })) as any;

    expect(result.activities).toHaveLength(1);
    expect(prisma.submissionActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { submissionId: 'sub-1', organizationId: 'org-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
    );
  });

  test('does not query or return staff activity to the submission owner', async () => {
    requireMembership.mockResolvedValue(
      membership(STUDENT_MEMBERSHIP_ID, 'STUDENT')
    );
    prisma.submission.findFirst.mockResolvedValue(buildSubmission());

    const result = (await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    })) as any;

    expect(prisma.submissionActivity.findMany).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('activities');
  });

  test('authorizes teachers only through the submission assigned class and tenant', async () => {
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue(
      membership(TEACHER_MEMBERSHIP_ID, 'TEACHER')
    );
    prisma.submission.findFirst.mockResolvedValue(buildSubmission());

    await loader({ request: request(), params: { submissionId: 'sub-1' } });

    const query = prisma.submission.findFirst.mock.calls[0]?.[0] as any;
    const teacherBranch = query.where.document.is.OR[1];
    expect(teacherBranch).toEqual({
      membership: { organizationId: 'org-1' },
      OR: [
        {
          classAssignment: {
            class: {
              school: { organizationId: 'org-1' },
              teachers: { some: { id: TEACHER_MEMBERSHIP_ID } },
            },
          },
        },
        {
          classAssignment: { is: null },
          membership: {
            classesAsStudent: {
              some: {
                school: { organizationId: 'org-1' },
                teachers: { some: { id: TEACHER_MEMBERSHIP_ID } },
              },
            },
          },
        },
      ],
    });
  });

  test('preserves tenant-scoped teacher access for legacy submissions', async () => {
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue(
      membership(TEACHER_MEMBERSHIP_ID, 'TEACHER')
    );
    const legacySubmission = buildSubmission() as any;
    legacySubmission.document.classAssignment = null;
    prisma.submission.findFirst.mockResolvedValue(legacySubmission);

    const result = (await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    })) as any;

    expect(result.isTeacher).toBe(true);
  });

  test('returns not found and never reads activity for an unrelated teacher', async () => {
    requireUserId.mockResolvedValue('user-unrelated-teacher');
    requireMembership.mockResolvedValue(
      membership('membership-unrelated-teacher', 'TEACHER')
    );
    prisma.submission.findFirst.mockResolvedValue(null);

    const result = await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    });
    const redirect = await readRedirect(result);

    expect(redirect.to).toBe('/app');
    expect(redirect.payload.description).toBe('Submission not found.');
    expect(prisma.submissionActivity.findMany).not.toHaveBeenCalled();
  });

  test('scopes a teacher read to the active organization', async () => {
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue(
      membership(TEACHER_MEMBERSHIP_ID, 'TEACHER', 'org-2')
    );
    prisma.submission.findFirst.mockResolvedValue(null);

    await loader({ request: request(), params: { submissionId: 'sub-1' } });

    const query = prisma.submission.findFirst.mock.calls[0]?.[0] as any;
    const teacherBranch = query.where.document.is.OR[1];
    expect(teacherBranch.membership).toEqual({ organizationId: 'org-2' });
    expect(teacherBranch.OR[0].classAssignment.class.school).toEqual({
      organizationId: 'org-2',
    });
    expect(teacherBranch.OR[1].classAssignment).toEqual({ is: null });
    expect(teacherBranch.OR[1].membership.classesAsStudent.some.school).toEqual(
      { organizationId: 'org-2' }
    );
    expect(prisma.submissionActivity.findMany).not.toHaveBeenCalled();
  });
});
