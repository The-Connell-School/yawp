import { afterEach, beforeEach, expect, mock, test } from 'bun:test';

let enabled = true;
let application: any = { id: 'app-a', status: 'SENT', organizationId: 'org-a' };
let memberships: any[] = [{ role: 'TEACHER', organizationId: 'org-a', organization: { plan: 'FREE_CLASSROOM' } }];
const queries: any[] = [];
const db: any = {
  freeTierApplication: { findFirst: mock(async (q: any) => { queries.push(q); return application; }) },
  orgMembership: { findMany: mock(async () => memberships) },
  organization: { findUnique: mock(async () => ({ plan: 'FREE_CLASSROOM' })) },
};
mock.module('~/utils/db.server', () => ({ prisma: db }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: mock(async (_key: string, org: string) => enabled && (!org || org === 'org-a')),
}));
let provisionResult: { status: string; organizationId?: string } = {
  status: 'already_provisioned',
  organizationId: 'org-a',
};
let teacherMembership: any = null;
let cookieMembershipId = '';
mock.module('./provision-free-classroom.server', () => ({
  provisionFreeClassroom: mock(async () => provisionResult),
}));
mock.module('./locked-preview-class-seed.server', () => ({
  ensureLockedPreviewSampleAssignments: mock(async () => {}),
}));
mock.module('~/cookies/membership-id.server', () => ({
  getMembershipId: mock(async () => cookieMembershipId),
}));
const originalOrgFindFirst = db.orgMembership.findMany;
const {
  enforceLockedPreviewRequest,
  assertOrganizationTeachingApproved,
  getLockedPreviewApplication,
  userHasPendingFreeTierTeachingLock,
  redactClassTeachingSecrets,
  organizationClassListQueryParts,
  organizationClassListTableState,
  ensureLockedPreviewClassroomForUser,
  recoverPendingLockedPreviewAccess,
  resolveLockedPreviewTeacherMembershipId,
} = await import('./locked-preview.server');

function resetLockedPreviewMembershipMocks() {
  provisionResult = { status: 'already_provisioned', organizationId: 'org-a' };
  teacherMembership = null;
  cookieMembershipId = '';
  db.orgMembership.findFirst = mock(async (args: any) => {
    if (args.where.role === 'TEACHER' && teacherMembership) {
      return teacherMembership;
    }
    return null;
  });
  db.orgMembership.update = mock(async () => teacherMembership);
  db.orgMembership.create = mock(async () => ({ id: 'member-new' }));
  db.school = { findFirst: mock(async () => ({ id: 'school-a' })) };
  db.class = { findFirst: mock(async () => ({ id: 'class-a' })) };
}

afterEach(() => {
  enabled = true;
  application = { id: 'app-a', status: 'SENT', organizationId: 'org-a' };
  memberships = [{ role: 'TEACHER', organizationId: 'org-a', organization: { plan: 'FREE_CLASSROOM' } }];
  queries.length = 0;
  db.freeTierApplication.findFirst = mock(async (q: any) => {
    queries.push(q);
    return application;
  });
  db.orgMembership.findMany = originalOrgFindFirst;
  resetLockedPreviewMembershipMocks();
});

beforeEach(() => resetLockedPreviewMembershipMocks());

test('ensureLockedPreviewClassroomForUser repairs teacher membership when org is already provisioned', async () => {
  application = { id: 'app-a', status: 'SENT', organizationId: 'org-a' };
  teacherMembership = null;
  const create = mock(async () => ({ id: 'member-repaired' }));
  db.orgMembership.create = create;
  await ensureLockedPreviewClassroomForUser('teacher');
  expect(create).toHaveBeenCalled();
});

test('resolveLockedPreviewTeacherMembershipId reactivates an inactive teacher membership', async () => {
  teacherMembership = { id: 'member-a', isActive: false };
  const update = mock(async () => teacherMembership);
  db.orgMembership.update = update;
  await expect(resolveLockedPreviewTeacherMembershipId('teacher')).resolves.toBe(
    'member-a'
  );
  expect(update).toHaveBeenCalled();
});

test('recoverPendingLockedPreviewAccess repairs stale membership cookies', async () => {
  teacherMembership = { id: 'member-a', isActive: true };
  cookieMembershipId = 'stale-cookie';
  const recovery = await recoverPendingLockedPreviewAccess(
    new Request('https://yawp.test/app'),
    'teacher'
  );
  expect(recovery).toEqual({
    kind: 'membership',
    membershipId: 'member-a',
    repairCookie: true,
  });
});

test('recoverPendingLockedPreviewAccess falls back to pending when provisioning cannot succeed', async () => {
  provisionResult = { status: 'pending_user' };
  const recovery = await recoverPendingLockedPreviewAccess(
    new Request('https://yawp.test/app'),
    'teacher'
  );
  expect(recovery).toEqual({ kind: 'pending' });
});

test('recoverPendingLockedPreviewAccess is what /no-membership uses to reopen locked preview', async () => {
  teacherMembership = { id: 'member-a', isActive: true };
  cookieMembershipId = '';
  const recovery = await recoverPendingLockedPreviewAccess(
    new Request('https://yawp.test/no-membership'),
    'teacher'
  );
  expect(recovery).toMatchObject({
    kind: 'membership',
    membershipId: 'member-a',
    repairCookie: true,
  });
});

test('requireMembership uses locked preview recovery before sending teachers to /no-membership', async () => {
  teacherMembership = {
    id: 'member-a',
    isActive: true,
    role: 'TEACHER',
    isOrgOwner: true,
    organization: {
      id: 'org-a',
      name: 'Free classroom',
      plan: 'FREE_CLASSROOM',
      numOfTeacherSeats: 1,
      reporterEnabled: false,
      classInsightsEnabled: true,
      writingPracticeEnabled: false,
      submissionActivityEnabled: false,
      revisionFlowEnabled: true,
    },
  };
  cookieMembershipId = 'stale-membership';
  const setMembershipId = mock(async () => 'membership-id=member-a');
  mock.module('~/cookies/membership-id.server', () => ({
    getMembershipId: mock(async () => cookieMembershipId),
    setMembershipId,
  }));
  mock.module('~/domain/student-license/student-license.server', () => ({
    getUaStudentLicenseAccess: mock(async () => 'BYPASS'),
  }));
  db.orgMembership.findUnique = mock(async (args: any) =>
    args.where.id === 'member-a' ? teacherMembership : null
  );
  const { requireMembership } = await import('~/utils/auth.server');
  const error = await requireMembership(
    new Request('https://yawp.test/app/my-classes'),
    'teacher'
  ).catch((thrown) => thrown);
  expect(error.status).toBe(302);
  expect(error.headers.get('location')).toBe('/app/my-classes');
  expect(setMembershipId).toHaveBeenCalledWith('member-a');
});
test('pending direct APIs fail with 403 before execution; app reads pass through', async () => {
  for (const path of ['/api/domain/reporter', '/app/assignments']) {
    await expect(
      enforceLockedPreviewRequest(
        new Request(`http://local${path}`, { method: 'POST' }),
        'teacher'
      )
    ).rejects.toMatchObject({ init: { status: 403 } });
  }
  await enforceLockedPreviewRequest(
    new Request('http://local/api/domain/lesson-planner', { method: 'POST' }),
    'teacher'
  );
  for (const status of ['ACCOUNT_CREATED', 'ADMIN_SUBMITTED'] as const) {
    application.status = status;
    await expect(
      enforceLockedPreviewRequest(
        new Request('http://local/api/domain/lesson-planner', {
          method: 'POST',
        }),
        'teacher'
      )
    ).rejects.toMatchObject({ init: { status: 403 } });
  }
  application.status = 'SENT';
  await expect(
    enforceLockedPreviewRequest(
      new Request('http://local/api/domain/lesson-planner/packet', {
        method: 'POST',
      }),
      'teacher'
    )
  ).rejects.toMatchObject({ init: { status: 403 } });
  await enforceLockedPreviewRequest(new Request('http://local/app/reporter'), 'teacher');
  await enforceLockedPreviewRequest(new Request('http://local/app/my-classes'), 'teacher');
});
test('allowed app reads, preparation and approval actions pass', async () => {
  await enforceLockedPreviewRequest(new Request('http://local/app/assignment-types/at-1'), 'teacher');
  await enforceLockedPreviewRequest(new Request('http://local/app/free-tier/onboarding', { method: 'POST' }), 'teacher');
  await enforceLockedPreviewRequest(new Request('http://local/app/free-tier/pending', { method: 'POST' }), 'teacher');
});
test('blocked assignment create returns teaching-approval shape with echoed fields', async () => {
  const form = new FormData();
  form.set('intent', 'create-assignment');
  form.set('title', 'Community Gardens');
  form.set('prompt', 'Pick one community garden in your town.');
  await expect(
    enforceLockedPreviewRequest(
      new Request('http://local/api/assignments/create', { method: 'POST', body: form }),
      'teacher'
    )
  ).rejects.toMatchObject({
    init: { status: 403 },
    data: {
      error: 'approval_required',
      approvalRequired: true,
      fields: {
        intent: 'create-assignment',
        title: 'Community Gardens',
        prompt: 'Pick one community garden in your town.',
      },
    },
  });
});

test('a new teacher has no organization membership until approval; the default shell plan is irrelevant', async () => {
  application.organizationId = null;
  memberships = [];
  await expect(
    enforceLockedPreviewRequest(
      new Request('http://local/api/assignments/create', { method: 'POST' }),
      'teacher'
    )
  ).rejects.toMatchObject({ init: { status: 403 } });
  memberships = [{ role: 'TEACHER', organizationId: 'default-org', organization: { plan: 'SCHOOL' } }];
  await expect(
    enforceLockedPreviewRequest(
      new Request('http://local/api/assignments/create', { method: 'POST' }),
      'teacher'
    )
  ).rejects.toMatchObject({ init: { status: 403 } });
});
test('flag off, approved and other roles retain normal behavior', async () => {
  const plannerReq = new Request('http://local/api/domain/lesson-planner', {
    method: 'POST',
  });
  const assignmentReq = new Request('http://local/api/assignments/create', {
    method: 'POST',
  });
  enabled = false;
  await enforceLockedPreviewRequest(plannerReq, 'teacher');
  enabled = true;
  application.status = 'APPROVED';
  await enforceLockedPreviewRequest(plannerReq, 'teacher');
  application.status = 'SENT';
  memberships[0].role = 'STUDENT';
  await enforceLockedPreviewRequest(plannerReq, 'teacher');
  await expect(
    enforceLockedPreviewRequest(assignmentReq, 'teacher')
  ).rejects.toMatchObject({ init: { status: 403 } });
  memberships[0].role = 'ADMIN';
  await expect(
    enforceLockedPreviewRequest(assignmentReq, 'teacher')
  ).rejects.toMatchObject({ init: { status: 403 } });
});
test('stale default-org membership hides preview app identity but pending lock stays on', async () => {
  memberships = [
    { id: 'default', role: 'TEACHER', organizationId: 'default-org', organization: { plan: 'FREE_CLASSROOM' } },
    { id: 'free', role: 'TEACHER', organizationId: 'org-a', organization: { plan: 'FREE_CLASSROOM' } },
  ];
  expect(await getLockedPreviewApplication('teacher', 'default')).toBeNull();
  expect(await userHasPendingFreeTierTeachingLock('teacher')).toBe(true);
  expect(await getLockedPreviewApplication('teacher')).toEqual(
    expect.objectContaining({ organizationId: 'org-a' })
  );
});
test('a pending application blocks mutations even with a mismatched membership cookie', async () => {
  memberships[0].organizationId = 'org-b';
  await expect(
    enforceLockedPreviewRequest(
      new Request('http://local/api/assignments/create', { method: 'POST' }),
      'teacher',
      'stale-membership-id'
    )
  ).rejects.toMatchObject({ init: { status: 403 } });
  memberships[0].organizationId = 'org-a';
  memberships[0].organization.plan = 'SCHOOL';
  await expect(
    enforceLockedPreviewRequest(
      new Request('http://local/app/my-classes', { method: 'POST' }),
      'teacher'
    )
  ).rejects.toMatchObject({ init: { status: 403 } });
});
test('userHasPendingFreeTierTeachingLock fails closed when application lookup throws', async () => {
  db.freeTierApplication.findFirst = mock(async () => {
    throw new Error('db_unavailable');
  });
  await expect(userHasPendingFreeTierTeachingLock('teacher')).resolves.toBe(true);
});

test('domain enrollment/assignment guard denies pending and does not deny approved or flag off', async () => {
  await expect(assertOrganizationTeachingApproved(db as any, 'org-a')).rejects.toMatchObject({ status: 403 });
  application.status = 'APPROVED'; await assertOrganizationTeachingApproved(db as any, 'org-a');
  application.status = 'SENT'; enabled = false; await assertOrganizationTeachingApproved(db as any, 'org-a');
  expect(queries[0].where.organizationId).toBe('org-a');
});
test('pending lesson planner scope allows SENT and MANUAL_REVIEW only', async () => {
  for (const status of ['SENT', 'MANUAL_REVIEW'] as const) {
    application.status = status;
    await assertOrganizationTeachingApproved(db as any, 'org-a', {
      allowPendingLessonPlanner: true,
    });
  }
  application.status = 'ACCOUNT_CREATED';
  await expect(
    assertOrganizationTeachingApproved(db as any, 'org-a', {
      allowPendingLessonPlanner: true,
    })
  ).rejects.toMatchObject({ status: 403 });
});

test('organizationClassListTableState remaps code sort for locked preview clients', () => {
  expect(
    organizationClassListTableState({
      sort: 'code',
      direction: 'desc',
      skip: 0,
      take: 20,
      hideTeachingSecrets: true,
    })
  ).toEqual({
    sort: 'createdAt',
    direction: 'desc',
    skip: 0,
    take: 20,
    codeSortDisabled: true,
  });

  expect(
    organizationClassListTableState({
      sort: 'code',
      direction: 'asc',
      skip: 5,
      take: 10,
      hideTeachingSecrets: false,
    })
  ).toEqual({
    sort: 'code',
    direction: 'asc',
    skip: 5,
    take: 10,
    codeSortDisabled: false,
  });
});

test('organizationClassListQueryParts omits code search and sort for locked preview', () => {
  const pending = organizationClassListQueryParts({
    q: 'probe',
    sort: 'code',
    hideTeachingSecrets: true,
  });
  expect(pending.orClause?.some((clause) => 'code' in clause)).toBe(false);
  expect(pending.orderByField).toBe('createdAt');

  const approved = organizationClassListQueryParts({
    q: 'probe',
    sort: 'code',
    hideTeachingSecrets: false,
  });
  expect(approved.orClause?.some((clause) => 'code' in clause)).toBe(true);
  expect(approved.orderByField).toBe('code');
});

test('redactClassTeachingSecrets blanks code and drops join token for locked preview', () => {
  const row = {
    id: 'class-1',
    code: 'SECRET',
    studentJoinToken: 'join-token',
    title: 'Class',
  };
  expect(redactClassTeachingSecrets(row, false)).toEqual(row);
  const redacted = redactClassTeachingSecrets(row, true);
  expect(redacted.id).toBe('class-1');
  expect(redacted.title).toBe('Class');
  expect(redacted.code).toBeNull();
  expect('studentJoinToken' in redacted).toBe(false);
  expect(JSON.stringify(redacted)).not.toContain('join-token');
});
