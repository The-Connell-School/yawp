import { beforeEach, expect, mock, test } from 'bun:test';

const requireOwner = mock(async () => ({ id: 'user-1' }));
const requireMembership = mock(async () => ({
  organization: { id: 'org-1' },
}));

mock.module('~/utils/auth.server', () => ({
  requireOwner,
  requireMembership,
}));

const sendEmail = mock(async () => ({ status: 'success', data: { id: 'mock' } }));
mock.module('~/utils/email.server', () => ({ sendEmail }));

const generateTOTP = mock(async () => ({
  otp: 'SECRET-OTP',
  secret: 'secret',
  period: 3600,
  algorithm: 'SHA-256',
}));

mock.module('~/utils/totp.server', () => ({ generateTOTP }));

mock.module('~/emails/build-account-emails.server', () => ({
  buildOrgTeacherInviteEmail: async () => ({
    subject: 'Join Yawp',
    text: 'text',
    html: '<p>html</p>',
  }),
  inviteeFirstName: (email: string) => email.split('@')[0] ?? 'Teacher',
}));

mock.module('~/utils/misc', () => ({
  getDomainUrl: () => 'https://example.test',
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

const prisma = {
  organization: {
    findUnique: mock(async () => ({ name: 'Test School' })),
  },
  user: {
    findUnique: mock(async () => ({ name: 'Admin User' })),
  },
  invitation: {
    deleteMany: mock(async () => ({ count: 0 })),
    create: mock(async () => ({})),
  },
  $transaction: mock(async (fn: (tx: typeof prisma) => unknown) => fn(prisma)),
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { action } = await import('./route');

function inviteRequest(email: string) {
  const body = new URLSearchParams();
  body.set('intent', 'invite-teachers');
  body.set('emails', email);
  return new Request('https://example.test/app/organization/teachers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

beforeEach(() => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ status: 'success', data: { id: 'mock' } });
  prisma.invitation.deleteMany.mockReset().mockResolvedValue({ count: 0 });
  prisma.invitation.create.mockReset().mockResolvedValue({});
  prisma.$transaction.mockReset();
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
    fn(prisma)
  );
  generateTOTP.mockReset().mockResolvedValue({
    otp: 'SECRET-OTP',
    secret: 'secret',
    period: 3600,
    algorithm: 'SHA-256',
  });
});

test('invite-teachers logs delivery failures without raw email', async () => {
  const errorLog = mock((..._args: unknown[]) => {});
  const originalError = console.error;
  console.error = errorLog as typeof console.error;
  try {
    sendEmail.mockRejectedValue(
      Object.assign(new Error('Provider rejected'), {
        name: 'validation_error',
        statusCode: 422,
      }),
    );

    const response = (await action({
      request: inviteRequest('teacher@school.edu'),
    } as never)) as { data: { sentCount: number; failedEmails: string[] } };

    expect(response.data.sentCount).toBe(0);
    expect(response.data.failedEmails).toEqual(['teacher@school.edu']);

    const serialized = JSON.stringify(errorLog.mock.calls);
    expect(serialized).toContain('org_teacher_invite_delivery_failed');
    expect(serialized).not.toContain('teacher@school.edu');
    expect(serialized).toContain('validation_error');
    expect(serialized).not.toContain('org_teacher_invite_failed');
  } finally {
    console.error = originalError;
  }
});

test('invite-teachers logs prisma failures with code and without delivery mislabel', async () => {
  const errorLog = mock((..._args: unknown[]) => {});
  const originalError = console.error;
  console.error = errorLog as typeof console.error;
  try {
    prisma.invitation.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on teacher@school.edu'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
        meta: { modelName: 'Invitation', target: ['target'] },
      }),
    );

    const response = (await action({
      request: inviteRequest('teacher@school.edu'),
    } as never)) as { data: { sentCount: number; failedEmails: string[] } };

    expect(response.data.sentCount).toBe(0);
    expect(response.data.failedEmails).toEqual(['teacher@school.edu']);

    const serialized = JSON.stringify(errorLog.mock.calls);
    expect(serialized).toContain('org_teacher_invite_failed');
    expect(serialized).toContain('P2002');
    expect(serialized).toContain('Invitation');
    expect(serialized).not.toContain('teacher@school.edu');
    expect(serialized).not.toContain('org_teacher_invite_delivery_failed');
    expect(serialized).not.toContain('UnknownError');
  } finally {
    console.error = originalError;
  }
});
