import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findUnique: mock() },
  submission: { findFirst: mock() },
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
    requireUserId.mockReset();
    requireMembership.mockReset();
    prisma.assignmentType.findUnique.mockReset();

    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.assignmentType.findUnique.mockResolvedValue(null);
    requireUserId.mockResolvedValue('user-student');
  });

  // Only one actor can set Submission.unsubmittedAt: the owning student, via
  // /api/domain/unsubmit-submission, which 403s teachers and admins. The
  // message must therefore be in the student's own frame.
  test('tells the student they unsubmitted it themselves', async () => {
    requireMembership.mockResolvedValue({
      id: STUDENT_MEMBERSHIP_ID,
      role: 'STUDENT',
    });
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
    requireMembership.mockResolvedValue({
      id: STUDENT_MEMBERSHIP_ID,
      role: 'STUDENT',
    });
    prisma.submission.findFirst.mockResolvedValue(buildSubmission());

    const result = await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    });

    expect(result).not.toBeInstanceOf(Response);
    expect((result as { isOwner: boolean }).isOwner).toBe(true);
  });

  test('does not redirect a teacher viewing an unsubmitted submission', async () => {
    requireMembership.mockResolvedValue({
      id: TEACHER_MEMBERSHIP_ID,
      role: 'TEACHER',
    });
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
});
