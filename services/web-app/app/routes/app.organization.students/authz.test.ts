/**
 * N5 -- cross-organization escalation on the owner-facing routes.
 *
 * Unlike route.test.ts, this file does NOT mock ~/utils/auth.server. requireOwner and
 * requireMembership run for real against a fixture user who owns organization A and holds
 * an ordinary membership in organization B, because the defect lives precisely in the gap
 * between those two helpers: mocking either one away hides it.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { matchesOwnerWhere } from '~/utils/testing/where-eval';

const prisma = {
  user: { findFirst: mock() },
  orgMembership: { findUnique: mock(), findFirst: mock(), findMany: mock(), count: mock() },
  session: { findUnique: mock() },
  class: { findMany: mock() },
};

const getMembershipId = mock();
const setMembershipId = mock();
const getSession = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/cookies/membership-id.server', () => ({
  getMembershipId,
  setMembershipId,
}));
mock.module('~/cookie-session-storages/authentication.server', () => ({
  authSessionStorage: { getSession, destroySession: mock() },
}));
mock.module('~/utils/cookies.server', () => ({
  getOrganizationStudentsTableCookie: mock(async () => ({
    sort: 'createdAt',
    direction: 'desc',
    skip: 0,
    take: 25,
  })),
  setOrganizationStudentsTableCookie: mock(async () => ''),
  getOrganizationStudentsTableCookieValue: mock(async () => ({})),
}));

const { loader } = await import('./route');

const twoOrgUser = {
  id: 'user-1',
  memberships: [
    { id: 'membership-a', organizationId: 'org-a', isOrgOwner: true },
    { id: 'membership-b', organizationId: 'org-b', isOrgOwner: false },
  ],
};

function arrange(activeMembershipId: string) {
  getSession.mockResolvedValue({
    get: (key: string) => (key === 'sessionId' ? 'session-1' : undefined),
  });
  prisma.session.findUnique.mockResolvedValue({ user: { id: 'user-1' } });
  getMembershipId.mockResolvedValue(activeMembershipId);

  const active = twoOrgUser.memberships.find((m) => m.id === activeMembershipId)!;
  prisma.orgMembership.findUnique.mockResolvedValue({
    id: active.id,
    role: 'TEACHER' as const,
    isOrgOwner: active.isOrgOwner,
    organization: {
      id: active.organizationId,
      name: active.organizationId,
      reporterEnabled: false,
      classInsightsEnabled: false,
      writingPracticeEnabled: false,
    },
  });

  prisma.user.findFirst.mockImplementation(async ({ where }: any) =>
    matchesOwnerWhere(where, twoOrgUser) ? twoOrgUser : null
  );

  // Organization B's student roster -- names and email addresses.
  prisma.orgMembership.findMany.mockResolvedValue([
    { id: 'student-b-1', user: { name: 'Org B Student', email: 'b.student@example.com' } },
  ]);
  prisma.orgMembership.count.mockResolvedValue(1);
  prisma.class.findMany.mockResolvedValue([]);
}

const request = () =>
  new Request('https://example.com/app/organization/students', {
    headers: { cookie: 'en_session=signed-cookie' },
  });

describe('app.organization.students authorization', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
    getMembershipId.mockReset();
    getSession.mockReset();
    setMembershipId.mockResolvedValue('membership-id=; Path=/');
  });

  test('an owner viewing their own organization gets its roster', async () => {
    arrange('membership-a');

    const result = (await loader({ request: request() } as any)) as any;

    expect(result.students).toHaveLength(1);
    expect(prisma.orgMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
      })
    );
  });

  test('an owner of another organization cannot read this organization roster', async () => {
    arrange('membership-b');

    await expect(loader({ request: request() } as any)).rejects.toMatchObject({
      init: { status: 403 },
    });
    expect(prisma.orgMembership.findMany).not.toHaveBeenCalled();
  });
});
