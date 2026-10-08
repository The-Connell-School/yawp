import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const getUserId = mock();
const requireUserId = mock();
const commitUaPartnerContext = mock();
const getUaPartnerCodeCapture = mock();
const getUaPartnerContext = mock();
const isValidUaPartnerCode = mock();
const isUaStudentBillingEnabled = mock();
const prisma = { orgMembership: { findFirst: mock(), create: mock() } };
const setMembershipId = mock();

mock.module('~/utils/auth.server', () => ({ getUserId, requireUserId }));
mock.module('~/utils/ua-partner.server', () => ({
  commitUaPartnerContext,
  // No UA_PARTNER_HOSTNAME in tests, so the entry never redirects to a canonical host.
  getCanonicalUaUrl: () => null,
  getUaPartnerCodeCapture,
  getUaPartnerContext,
  isValidUaPartnerCode,
  isUaStudentBillingEnabled,
  requireUaOrganizationId: () => 'org-ua',
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/cookies/membership-id.server', () => ({ setMembershipId }));

const { action, loader } = await import('./route');

describe('/ua', () => {
  let previousResponse: typeof Response;
  afterEach(() => { globalThis.Response = previousResponse; });
  beforeEach(() => {
    previousResponse = globalThis.Response;
    globalThis.Response = globalThis.__serverResponse;
    getUserId.mockReset();
    requireUserId.mockReset();
    commitUaPartnerContext.mockReset();
    getUaPartnerCodeCapture.mockReset();
    getUaPartnerContext.mockReset();
    isValidUaPartnerCode.mockReset();
    isUaStudentBillingEnabled.mockReset();
    prisma.orgMembership.findFirst.mockReset();
    prisma.orgMembership.create.mockReset();
    setMembershipId.mockReset();
    commitUaPartnerContext.mockResolvedValue('partner=ua; HttpOnly');
    getUaPartnerCodeCapture.mockReturnValue(null);
    getUaPartnerContext.mockResolvedValue(null);
    isValidUaPartnerCode.mockReturnValue(false);
    isUaStudentBillingEnabled.mockReturnValue(true);
    setMembershipId.mockResolvedValue('membership-id=member-ua');
  });

  test('shows the auth landing without trusting a bare UA URL', async () => {
    getUserId.mockResolvedValue(null);
    const response = (await loader({
      request: new Request('https://yawp.school/ua'),
    } as any)) as any;

    expect((response.data ?? response).authenticated).toBe(false);
    expect((response.data ?? response).codeAccepted).toBe(false);
    expect(commitUaPartnerContext).not.toHaveBeenCalled();
  });

  test('accepts a valid code from the URL, saves it, and removes it from the URL', async () => {
    getUaPartnerCodeCapture.mockReturnValue({
      accepted: true,
      redirectTo: '/ua',
    });

    const response = (await loader({
      request: new Request('https://yawp.school/ua?code=ROLLTIDE'),
    } as any)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/ua');
    expect(commitUaPartnerContext).toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toContain('partner=ua');
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
    requireUserId.mockResolvedValue('user-1');
    getUaPartnerContext.mockResolvedValue({ partner: 'ua' });
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    prisma.orgMembership.create.mockResolvedValue({ id: 'member-ua' });
    const form = new FormData();

    const response = (await action({
      request: new Request('https://yawp.school/ua', {
        method: 'POST',
        body: form,
      }),
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

  test('requires a valid organization code before adding UA to an existing account', async () => {
    requireUserId.mockResolvedValue('user-1');
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    const form = new FormData();

    const response = (await action({
      request: new Request('https://yawp.school/ua', {
        method: 'POST',
        body: form,
      }),
    } as any)) as any;

    expect(response.init.status).toBe(400);
    expect(prisma.orgMembership.create).not.toHaveBeenCalled();
  });
});
