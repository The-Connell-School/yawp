import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock() },
  user: { findFirst: mock() },
  invitation: { findFirst: mock(), delete: mock(), create: mock() },
};
const getUaPartnerContext = mock();
const requireUaOrganizationId = mock();
const sendEmail = mock();
const generateTOTP = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/ua-partner.server', () => ({
  getUaPartnerContext,
  requireUaOrganizationId,
}));
mock.module('~/utils/email.server', () => ({ sendEmail }));
mock.module('~/utils/totp.server', () => ({ generateTOTP }));

const { action } = await import('./route');

function signup(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request('https://yawp.school/auth/inv/signup', {
    method: 'POST',
    body: form,
  });
}

describe('UA student signup', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
    getUaPartnerContext.mockReset();
    requireUaOrganizationId.mockReset();
    sendEmail.mockReset();
    generateTOTP.mockReset();

    prisma.user.findFirst.mockResolvedValue(null);
    prisma.invitation.findFirst.mockResolvedValue(null);
    prisma.invitation.create.mockResolvedValue({ id: 'invite-1' });
    requireUaOrganizationId.mockReturnValue('org-ua');
    generateTOTP.mockResolvedValue({
      otp: 'ABC123',
      algorithm: 'SHA-256',
      secret: 'secret',
      charSet: 'ABC123',
      period: 600,
    });
    sendEmail.mockResolvedValue({ status: 'success' });
  });

  test('trusted UA context creates a student invitation without a class code', async () => {
    getUaPartnerContext.mockResolvedValue({ partner: 'ua' });

    const response = (await action({
      request: signup({ email: 'student@ua.edu' }),
    } as any)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('partner=ua');
    expect(prisma.class.findMany).not.toHaveBeenCalled();
    expect(prisma.invitation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'onboard-student',
        target: 'student@ua.edu',
        metadata: JSON.stringify({ partner: 'ua', organizationId: 'org-ua' }),
      }),
    });
  });

  test('generic signup still requires and validates a class code', async () => {
    getUaPartnerContext.mockResolvedValue(null);

    const response = await action({
      request: signup({ email: 'student@example.com' }),
    } as any);

    expect(response).not.toBeInstanceOf(Response);
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });
});
