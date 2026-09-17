import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findUnique: mock() },
  assignment: { findUnique: mock() },
  submission: { findFirst: mock() },
  submissionActivity: { findMany: mock() },
  assignmentType: { findUnique: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const loadGradingQueueNeighbors = mock();

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
mock.module('~/domain/grading/grading-queue.server', () => ({
  loadGradingQueueNeighbors,
}));
const { loader: routeLoader } = await import('./route');
const loader = routeLoader as any;

const STUDENT_MEMBERSHIP_ID = 'membership-student';
const TEACHER_MEMBERSHIP_ID = 'membership-teacher';

function membership(
  id: string,
  role: 'STUDENT' | 'TEACHER',
  organizationId = 'org-1',
  { revisionFlowEnabled = false }: { revisionFlowEnabled?: boolean } = {}
) {
  return {
    id,
    role,
    organization: { id: organizationId, revisionFlowEnabled },
  };
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
    loadGradingQueueNeighbors.mockReset();

    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.assignmentType.findUnique.mockResolvedValue(null);
    prisma.submissionActivity.findMany.mockResolvedValue([]);
    loadGradingQueueNeighbors.mockResolvedValue(null);
    requireUserId.mockResolvedValue('user-student');
  });

  // Only a student author can set Submission.unsubmittedAt: the solo owner or
  // an active group member. The endpoint still refuses teachers and admins.
  test('shows the effective 90-point rubric before the first grading run', async () => {
    const { default: authored } = await import('~/domain/rubrics/library/daily-pages-engagement.json');
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue(membership(TEACHER_MEMBERSHIP_ID, 'TEACHER'));
    const submission = buildSubmission() as any;
    submission.document.assignment = { id: 'fresh-daily', pointValue: 90 };
    prisma.submission.findFirst.mockResolvedValue(submission);
    prisma.assignment.findUnique.mockResolvedValue({ assignmentTypeId: 'at-1', rubricRevision: { version: 7, rubricName: authored.name, schemaJson: authored } });
    prisma.assignmentType.findUnique.mockResolvedValue({ id: 'at-1', title: 'Daily Pages', kind: 'daily_pages', rubric: { name: authored.name, schemaJson: authored } });
    const result = await loader({ request: request(), params: { submissionId: 'sub-1' } });
    expect(result.submission.rubricConfig.maxScore).toBe(90);
    expect(result.submission.rubricConfig.categories[0].bands.map((band: any) => [band.min, band.max])).toEqual([[0, 0], [21, 39], [51, 69], [84, 90]]);
  });

  test('loads grading queue navigation without an organization rollout flag', async () => {
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue(
      membership(TEACHER_MEMBERSHIP_ID, 'TEACHER')
    );
    prisma.submission.findFirst.mockResolvedValue(buildSubmission());

    const result = await loader({
      request: new Request(
        'https://example.test/app/submissions/sub-1?exitTo=%2Fapp%2Fmy-classes%2Fclass-1%3Ftab%3Ddocuments%26status%3Dneeds-grading'
      ),
      params: { submissionId: 'sub-1' },
    });

    expect(loadGradingQueueNeighbors).toHaveBeenCalledTimes(1);
    expect(loadGradingQueueNeighbors.mock.calls[0][0]).toMatchObject({
      membershipId: TEACHER_MEMBERSHIP_ID,
      organizationId: 'org-1',
      submissionId: 'sub-1',
      scope: {
        kind: 'class',
        classId: 'class-1',
        filters: { status: 'needs-grading' },
      },
    });
    expect(result.gradingQueue).toBeNull();
  });

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

  test('returns an active group member to the shared artifact after unsubmit', async () => {
    requireMembership.mockResolvedValue(
      membership(STUDENT_MEMBERSHIP_ID, 'STUDENT')
    );
    const sharedSubmission = buildSubmission({
      unsubmittedAt: new Date('2026-08-02T00:00:00Z'),
    }) as any;
    sharedSubmission.document.membership = null;
    sharedSubmission.document.group = {
      id: 'group-1',
      label: 'Group 1',
      members: [{ membershipId: STUDENT_MEMBERSHIP_ID }],
    };
    prisma.submission.findFirst.mockResolvedValue(sharedSubmission);

    const result = await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    });
    const redirect = await readRedirect(result);

    expect(redirect.to).toBe('/app/collab-documents/doc-1');
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

  test('loads active submission versions newest-first for student navigation', async () => {
    requireMembership.mockResolvedValue(
      membership(STUDENT_MEMBERSHIP_ID, 'STUDENT')
    );
    prisma.submission.findFirst.mockResolvedValue(buildSubmission());

    await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    });

    const documentSelect =
      prisma.submission.findFirst.mock.calls[0][0].select.document.select;
    expect(documentSelect.submissions).toMatchObject({
      where: { archivedAt: null, unsubmittedAt: null },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        submittedAt: true,
        releasedAt: true,
        numericPercentage: true,
        letterGrade: true,
        score: true,
      },
    });
  });

  test('reports the revision flow gate so the Revise button can route on it', async () => {
    requireMembership.mockResolvedValue(
      membership(STUDENT_MEMBERSHIP_ID, 'STUDENT', 'org-1', {
        revisionFlowEnabled: true,
      })
    );
    prisma.submission.findFirst.mockResolvedValue(buildSubmission());

    const result = await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    });

    expect(
      (result as { revisionFlowEnabled: boolean }).revisionFlowEnabled
    ).toBe(true);
  });

  test('reports the revision flow gate as off for an organization without it', async () => {
    requireMembership.mockResolvedValue(
      membership(STUDENT_MEMBERSHIP_ID, 'STUDENT')
    );
    prisma.submission.findFirst.mockResolvedValue(buildSubmission());

    const result = await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    });

    expect(
      (result as { revisionFlowEnabled: boolean }).revisionFlowEnabled
    ).toBe(false);
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
    expect(result.activityHasMore).toBe(false);
    expect(prisma.submissionActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { submissionId: 'sub-1', organizationId: 'org-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 101,
      })
    );
  });

  test('returns only the newest 100 activity rows and reports older history', async () => {
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue(
      membership(TEACHER_MEMBERSHIP_ID, 'TEACHER')
    );
    prisma.submission.findFirst.mockResolvedValue(buildSubmission());
    prisma.submissionActivity.findMany.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({ id: `activity-${index}` }))
    );

    const result = (await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    })) as any;

    expect(result.activities).toHaveLength(100);
    expect(result.activityHasMore).toBe(true);
  });

  test('lets a platform admin read tenant-scoped staff activity', async () => {
    requireUserId.mockResolvedValue('user-admin');
    requireMembership.mockResolvedValue(
      membership(TEACHER_MEMBERSHIP_ID, 'TEACHER', 'org-2')
    );
    prisma.user.findUnique.mockResolvedValue({ isAdmin: true });
    prisma.submission.findFirst.mockResolvedValue(buildSubmission());
    prisma.submissionActivity.findMany.mockResolvedValue([
      { id: 'activity-admin-visible' },
    ]);

    const result = (await loader({
      request: request(),
      params: { submissionId: 'sub-1' },
    })) as any;

    expect(result.isTeacher).toBe(true);
    expect(result.activities).toHaveLength(1);
    expect(prisma.submissionActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { submissionId: 'sub-1', organizationId: 'org-1' },
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
    const teacherBranch = query.where.document.is.OR[2];
    expect(teacherBranch).toEqual({
      OR: [
        {
          classAssignment: {
            class: {
              school: { organizationId: 'org-1' },
              teachers: {
                some: { id: TEACHER_MEMBERSHIP_ID, isActive: true },
              },
            },
          },
        },
        {
          classAssignment: { is: null },
          membership: {
            is: {
              organizationId: 'org-1',
              classesAsStudent: {
                some: {
                  school: { organizationId: 'org-1' },
                  teachers: {
                    some: { id: TEACHER_MEMBERSHIP_ID, isActive: true },
                  },
                },
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
    const teacherBranch = query.where.document.is.OR[2];
    expect(teacherBranch.OR[0].classAssignment.class.school).toEqual({
      organizationId: 'org-2',
    });
    expect(teacherBranch.OR[1].classAssignment).toEqual({ is: null });
    expect(teacherBranch.OR[1].membership.is.organizationId).toBe('org-2');
    expect(
      teacherBranch.OR[1].membership.is.classesAsStudent.some.school
    ).toEqual({ organizationId: 'org-2' });
    expect(prisma.submissionActivity.findMany).not.toHaveBeenCalled();
  });

  test.each([
    { role: 'STUDENT', user: 'user-student', member: STUDENT_MEMBERSHIP_ID, admin: false, released: false, allowed: false },
    { role: 'STUDENT', user: 'user-student', member: STUDENT_MEMBERSHIP_ID, admin: false, released: true, allowed: false },
    { role: 'TEACHER', user: 'user-student', member: STUDENT_MEMBERSHIP_ID, admin: true, released: true, allowed: false },
    { role: 'TEACHER', user: 'user-teacher', member: TEACHER_MEMBERSHIP_ID, admin: false, released: false, allowed: true },
    { role: 'TEACHER', user: 'user-teacher', member: TEACHER_MEMBERSHIP_ID, admin: false, released: true, allowed: true },
    { role: 'TEACHER', user: 'user-admin', member: 'admin', admin: true, released: true, allowed: true },
    { role: 'TEACHER', user: 'unrelated', member: 'unrelated', admin: false, released: true, allowed: false },
  ])('keeps private teacher notes scoped for $role / $user / released=$released', async ({ role, user, member, admin, released, allowed }) => {
    requireUserId.mockResolvedValue(user);
    requireMembership.mockResolvedValue(membership(member, role as 'STUDENT' | 'TEACHER'));
    prisma.user.findUnique.mockResolvedValue({ isAdmin: admin });
    const submission = buildSubmission() as any;
    submission.releasedAt = released ? new Date() : null;
    submission.gradingAssistantRuns = [{ status: 'succeeded', source: 'assignment-type', metadata: { teacherNote: 'PRIVATE_OBSERVATION: vocabulary shifts in the final paragraph.', output: { rubricScores: { engagement: { score: 18 } }, overallComment: 'Warm public feedback.' } } }];
    prisma.submission.findFirst.mockResolvedValue(submission);
    const result = await loader({ request: request(), params: { submissionId: 'sub-1' } });
    expect(result.submission.gradingAssistantRuns).toBeUndefined();
    expect(JSON.stringify(result.submission)).not.toContain('PRIVATE_OBSERVATION');
    if (allowed) expect(result.teacherNote).toContain('PRIVATE_OBSERVATION');
    else {
      expect(result).not.toHaveProperty('teacherNote');
      expect(JSON.stringify(result)).not.toContain('PRIVATE_OBSERVATION');
    }
  });

  test('hides private notes from a group owner using another organization membership as admin', async () => {
    requireUserId.mockResolvedValue('group-owner-user');
    requireMembership.mockResolvedValue(membership('different-active-membership', 'TEACHER', 'org-2'));
    prisma.user.findUnique.mockResolvedValue({ isAdmin: true });
    const submission = buildSubmission() as any;
    submission.document.group = { id: 'group', members: [{ membershipId: 'owner-membership-org-1', membership: { userId: 'group-owner-user' } }] };
    submission.gradingAssistantRuns = [{ status: 'succeeded', metadata: { teacherNote: 'PRIVATE_GROUP_OBSERVATION' } }];
    prisma.submission.findFirst.mockResolvedValue(submission);
    const result = await loader({ request: request(), params: { submissionId: 'sub-1' } });
    expect(result.isOwner).toBe(true);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_GROUP_OBSERVATION');
    expect(result).not.toHaveProperty('teacherNote');
  });

  test('group-owner and cross-organization viewers receive no private note', async () => {
    for (const groupOwner of [true, false]) {
      requireUserId.mockResolvedValue('other-user');
      requireMembership.mockResolvedValue(membership(TEACHER_MEMBERSHIP_ID, 'TEACHER', groupOwner ? 'org-1' : 'org-2'));
      const submission = buildSubmission() as any;
      if (groupOwner) submission.document.group = { id: 'group', members: [{ membershipId: TEACHER_MEMBERSHIP_ID }] };
      submission.gradingAssistantRuns = [{ status: 'succeeded', metadata: { teacherNote: 'PRIVATE_OBSERVATION' } }];
      prisma.submission.findFirst.mockResolvedValue(submission);
      const result = await loader({ request: request(), params: { submissionId: 'sub-1' } });
      expect(JSON.stringify(result)).not.toContain('PRIVATE_OBSERVATION');
      expect(result).not.toHaveProperty('teacherNote');
    }
  });

});
