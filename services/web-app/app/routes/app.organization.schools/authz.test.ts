/**
 * N5 -- cross-organization escalation, second of the six owner-facing routes.
 *
 * As in app.organization.students/authz.test.ts, ~/utils/auth.server is deliberately left
 * unmocked: the defect is the gap between requireOwner and requireMembership.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { matchesOwnerWhere } from '~/utils/testing/where-eval';

const prisma = {
  user: { findFirst: mock() },
  orgMembership: { findUnique: mock(), findFirst: mock(), findMany: mock() },
  session: { findUnique: mock() },
  school: { findMany: mock() },
  assignmentType: { findMany: mock() },
  organizationAssignmentType: { findMany: mock() },
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

  prisma.school.findMany.mockResolvedValue([{ id: 'school-b-1', name: 'Org B High' }]);
  prisma.orgMembership.findMany.mockResolvedValue([]);
  prisma.assignmentType.findMany.mockResolvedValue([]);
  prisma.organizationAssignmentType.findMany.mockResolvedValue([]);
}

const request = () =>
  new Request('https://example.com/app/organization/schools', {
    headers: { cookie: 'en_session=signed-cookie' },
  });

describe('app.organization.schools authorization', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
    getMembershipId.mockReset();
    getSession.mockReset();
    setMembershipId.mockResolvedValue('membership-id=; Path=/');
  });

  test('an owner viewing their own organization gets its schools', async () => {
    arrange('membership-a');

    await expect(loader({ request: request() } as any)).resolves.toBeDefined();
    expect(prisma.school.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
      })
    );
  });

  test('an owner of another organization cannot read this organization schools', async () => {
    arrange('membership-b');

    await expect(loader({ request: request() } as any)).rejects.toMatchObject({
      init: { status: 403 },
    });
    expect(prisma.school.findMany).not.toHaveBeenCalled();
  });
});
