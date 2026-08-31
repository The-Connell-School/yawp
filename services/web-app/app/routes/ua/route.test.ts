import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getUserId = mock();
const commitUaPartnerContext = mock();
const isUaStudentBillingEnabled = mock();
const prisma = { orgMembership: { findFirst: mock(), create: mock() } };
const setMembershipId = mock();

mock.module('~/utils/auth.server', () => ({ getUserId }));
mock.module('~/utils/ua-partner.server', () => ({
  commitUaPartnerContext,
  isUaStudentBillingEnabled,
  requireUaOrganizationId: () => 'org-ua',
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/cookies/membership-id.server', () => ({ setMembershipId }));

const { action, loader } = await import('./route');

describe('/ua', () => {
  beforeEach(() => {
    getUserId.mockReset();
    commitUaPartnerContext.mockReset();
    isUaStudentBillingEnabled.mockReset();
    prisma.orgMembership.findFirst.mockReset();
    prisma.orgMembership.create.mockReset();
    setMembershipId.mockReset();
    commitUaPartnerContext.mockResolvedValue('partner=ua; HttpOnly');
    isUaStudentBillingEnabled.mockReturnValue(true);
    setMembershipId.mockResolvedValue('membership-id=member-ua');
  });

  test('shows the auth landing and establishes trusted UA context for an anonymous visitor', async () => {
    getUserId.mockResolvedValue(null);
    const response = (await loader({
      request: new Request('https://yawp.school/ua'),
    } as any)) as any;

    expect((response.data ?? response).authenticated).toBe(false);
    expect(response.init.headers['set-cookie']).toContain('partner=ua');
  });

  test('selects an existing UA membership and continues to billing', async () => {
    getUserId.mockResolvedValue('user-1');
    prisma.orgMembership.findFirst.mockResolvedValue({
      id: 'member-ua',
      role: 'STUDENT',
    });

    const response = (await loader({
      request: new Request('https://yawp.school/ua'),
    } as any)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/billing/ua');
    expect(setMembershipId).toHaveBeenCalledWith('member-ua');
  });

  test('does not convert or bill a UA teacher', async () => {
    getUserId.mockResolvedValue('teacher-1');
    prisma.orgMembership.findFirst.mockResolvedValue({
      id: 'teacher-ua',
      role: 'TEACHER',
    });

    const response = (await loader({
      request: new Request('https://yawp.school/ua'),
    } as any)) as Response;

    expect(response.headers.get('location')).toBe('/app');
    expect(prisma.orgMembership.create).not.toHaveBeenCalled();
  });

  test('creates only a student membership after an authenticated user explicitly continues', async () => {
    getUserId.mockResolvedValue('user-1');
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    prisma.orgMembership.create.mockResolvedValue({ id: 'member-ua' });

    const response = (await action({
      request: new Request('https://yawp.school/ua', { method: 'POST' }),
    } as any)) as Response;

    expect(prisma.orgMembership.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        organizationId: 'org-ua',
        role: 'STUDENT',
      },
      select: { id: true },
    });
    expect(response.headers.get('location')).toBe('/billing/ua');
  });
});
