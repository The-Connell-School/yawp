import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const setMembershipId = mock();
const prisma = {
  orgMembership: {
    findFirst: mock(),
  },
};

mock.module('~/utils/auth.server', () => ({ requireUserId }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/cookies/membership-id.server', () => ({
  setMembershipId,
}));

const { action } = await import('./route');

function membershipSwitchRequest(membershipId: string, referer?: string) {
  const body = new FormData();
  body.set('membershipId', membershipId);
  const headers: Record<string, string> = {};
  if (referer) headers.Referer = referer;
  return new Request('https://example.com/api/membership-id', {
    method: 'POST',
    body,
    headers,
  });
}

describe('api.membership-id action', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    setMembershipId.mockReset();
    prisma.orgMembership.findFirst.mockReset();
    requireUserId.mockResolvedValue('user-1');
    setMembershipId.mockResolvedValue('membership-id=active; Path=/');
  });

  test('sets membership cookie and redirects to /app, not Referer', async () => {
    prisma.orgMembership.findFirst.mockResolvedValue({ id: 'membership-2' });

    const response = (await action({
      request: membershipSwitchRequest(
        'membership-2',
        'https://example.com/app/my-classes/class-old-org'
      ),
    } as Parameters<typeof action>[0])) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/app');
    expect(setMembershipId).toHaveBeenCalledWith('membership-2');
    expect(prisma.orgMembership.findFirst).toHaveBeenCalledWith({
      where: { id: 'membership-2', userId: 'user-1', isActive: true },
      select: { id: true },
    });
  });

  test('rejects inactive memberships without setting a cookie', async () => {
    prisma.orgMembership.findFirst.mockResolvedValue(null);

    const response = (await action({
      request: membershipSwitchRequest(
        'inactive-membership',
        'https://example.com/app/my-classes/class-old-org'
      ),
    } as Parameters<typeof action>[0])) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/app');
    expect(setMembershipId).not.toHaveBeenCalled();
  });
});
