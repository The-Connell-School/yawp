import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findFirst: mock() },
  invitation: { deleteMany: mock(), create: mock() },
};
const sendEmail = mock();
const generateTOTP = mock();

mock.module('~/utils/db.server.ts', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/email.server.ts', () => ({ sendEmail }));
mock.module('~/utils/email.server', () => ({ sendEmail }));
mock.module('~/utils/totp.server', () => ({ generateTOTP }));
mock.module('~/utils/rate-limit.server', () => ({
  enforceUnauthByIpAndTarget: async () => ({ allowed: true }),
  rateLimitedFormResponse: () => new Response(null, { status: 429 }),
}));

const { action } = await import('./route');

function forgotPasswordRequest(email: string) {
  const form = new FormData();
  form.set('email', email);
  return new Request('https://yawp.school/auth/inv/forgot-password', {
    method: 'POST',
    body: form,
  });
}

describe('auth.inv.forgot-password action', () => {
  beforeEach(() => {
    generateTOTP.mockResolvedValue({
      otp: 'ABC123',
      algorithm: 'SHA-256',
      secret: 'secret',
      charSet: 'ABC123',
      period: 600,
    });
    prisma.user.findFirst.mockResolvedValue({ email: 'teacher@school.edu' });
    prisma.invitation.deleteMany.mockResolvedValue({ count: 0 });
    prisma.invitation.create.mockResolvedValue({ id: 'inv-1' });
    sendEmail.mockReset();
  });

  test('does not return raw provider error text when email delivery fails', async () => {
    const sensitive =
      'Invalid `prisma.user.findMany()` token=SECRET-TOKEN teacher@school.edu';
    sendEmail.mockResolvedValue({
      status: 'error',
      error: { name: 'SESError', message: sensitive, statusCode: 500 },
    });

    const result = await action({
      request: forgotPasswordRequest('teacher@school.edu'),
    } as any);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('SECRET-TOKEN');
    expect(serialized).not.toContain(sensitive);
    expect(serialized).toContain('Failed to send email. Please try again.');
  });
});
