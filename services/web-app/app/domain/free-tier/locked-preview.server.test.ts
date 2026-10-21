import { afterEach, expect, mock, test } from 'bun:test';

let enabled = true;
let application: any = { id: 'app-a', status: 'SENT', organizationId: 'org-a' };
let memberships: any[] = [{ role: 'TEACHER', organizationId: 'org-a', organization: { plan: 'FREE_CLASSROOM' } }];
const queries: any[] = [];
const db = {
  freeTierApplication: { findFirst: mock(async (q: any) => { queries.push(q); return application; }) },
  orgMembership: { findMany: mock(async () => memberships) },
  organization: { findUnique: mock(async () => ({ plan: 'FREE_CLASSROOM' })) },
};
mock.module('~/utils/db.server', () => ({ prisma: db }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: mock(async (_key: string, org: string) => enabled && (!org || org === 'org-a')),
}));
const {
  enforceLockedPreviewRequest,
  assertOrganizationTeachingApproved,
  getLockedPreviewApplication,
  userHasPendingFreeTierTeachingLock,
} = await import('./locked-preview.server');
afterEach(() => {
  enabled = true;
  application = { id: 'app-a', status: 'SENT', organizationId: 'org-a' };
  memberships = [{ role: 'TEACHER', organizationId: 'org-a', organization: { plan: 'FREE_CLASSROOM' } }];
  queries.length = 0;
  db.freeTierApplication.findFirst = mock(async (q: any) => {
    queries.push(q);
    return application;
  });
});
test('pending direct APIs fail with 403 before execution; app reads pass through', async () => {
  for (const path of ['/api/domain/reporter', '/api/domain/lesson-planner', '/app/assignments']) {
    try { await enforceLockedPreviewRequest(new Request(`http://local${path}`, { method: 'POST' }), 'teacher'); throw Error('allowed'); }
    catch (e) { expect((e as Response).status).toBe(403); }
  }
  await enforceLockedPreviewRequest(new Request('http://local/app/reporter'), 'teacher');
  await enforceLockedPreviewRequest(new Request('http://local/app/my-classes'), 'teacher');
});
test('allowed app reads, preparation and approval actions pass', async () => {
  await enforceLockedPreviewRequest(new Request('http://local/app/assignment-types/at-1'), 'teacher');
  await enforceLockedPreviewRequest(new Request('http://local/app/free-tier/onboarding', { method: 'POST' }), 'teacher');
  await enforceLockedPreviewRequest(new Request('http://local/app/free-tier/pending', { method: 'POST' }), 'teacher');
});
test('a new teacher has no organization membership until approval; the default shell plan is irrelevant', async () => {
  application.organizationId = null;
  memberships = [];
  await expect(enforceLockedPreviewRequest(new Request('http://local/api/assignments/create', { method: 'POST' }), 'teacher')).rejects.toMatchObject({ status: 403 });
  memberships = [{ role: 'TEACHER', organizationId: 'default-org', organization: { plan: 'SCHOOL' } }];
  await expect(enforceLockedPreviewRequest(new Request('http://local/api/assignments/create', { method: 'POST' }), 'teacher')).rejects.toMatchObject({ status: 403 });
});
test('flag off, approved and other roles retain normal behavior', async () => {
  const req = new Request('http://local/api/domain/lesson-planner', { method: 'POST' });
  enabled = false;
  await enforceLockedPreviewRequest(req, 'teacher');
  enabled = true;
  application.status = 'APPROVED';
  await enforceLockedPreviewRequest(req, 'teacher');
  application.status = 'SENT';
  memberships[0].role = 'STUDENT';
  await expect(enforceLockedPreviewRequest(req, 'teacher')).rejects.toMatchObject({
    status: 403,
  });
  memberships[0].role = 'ADMIN';
  await expect(enforceLockedPreviewRequest(req, 'teacher')).rejects.toMatchObject({
    status: 403,
  });
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
  ).rejects.toMatchObject({ status: 403 });
  memberships[0].organizationId = 'org-a';
  memberships[0].organization.plan = 'SCHOOL';
  await expect(
    enforceLockedPreviewRequest(
      new Request('http://local/app/my-classes', { method: 'POST' }),
      'teacher'
    )
  ).rejects.toMatchObject({ status: 403 });
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
