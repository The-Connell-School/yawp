import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  TEACHER_INVITE_ALL_FAILED_MESSAGE,
  TEACHER_INVITE_SERVER_ERROR_MESSAGE,
  teacherInviteSuccessMessage,
} from './teacher-invite-copy';

const requireOwner = mock(async () => ({ id: 'owner-user-1' }));
const requireMembership = mock(async () => ({
  organization: { id: 'org-1' },
}));
const sendEmail = mock();
const generateTOTP = mock();
const buildOrgTeacherInviteEmail = mock();

mock.module('~/utils/auth.server', () => ({
  requireOwner,
  requireMembership,
}));
mock.module('~/utils/email.server', () => ({ sendEmail }));
mock.module('~/utils/totp.server', () => ({ generateTOTP }));
mock.module('~/emails/build-account-emails.server', () => ({
  buildOrgTeacherInviteEmail,
  inviteeFirstName: (email: string) => email.split('@')[0],
}));
mock.module('~/utils/misc', () => ({
  getDomainUrl: () => 'https://yawp.test',
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

const prisma = {
  organization: {
    findUnique: mock(),
  },
  user: {
    findUnique: mock(),
  },
  invitation: {
    findFirst: mock(),
    delete: mock(),
    create: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

function inviteRequest(emails: string) {
  const body = new URLSearchParams();
  body.set('intent', 'invite-teachers');
  body.set('emails', emails);
  return new Request('https://yawp.test/app/organization/teachers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

function unwrapData<T>(response: unknown): T {
  return (response as { data: T }).data;
}

describe('invite-teachers action', () => {
  beforeEach(() => {
    requireOwner.mockClear();
    requireMembership.mockClear();
    sendEmail.mockReset();
    generateTOTP.mockReset();
    buildOrgTeacherInviteEmail.mockReset();
    prisma.organization.findUnique.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.invitation.findFirst.mockReset();
    prisma.invitation.delete.mockReset();
    prisma.invitation.create.mockReset();

    prisma.organization.findUnique.mockResolvedValue({ name: 'Yawp! High' });
    prisma.user.findUnique.mockResolvedValue({ name: 'Pat Owner' });
    prisma.invitation.findFirst.mockResolvedValue(null);
    prisma.invitation.create.mockResolvedValue({ id: 'inv-1' });
    generateTOTP.mockResolvedValue({
      otp: 'ABC123',
      algorithm: 'SHA-256',
      secret: 'secret',
      period: 259200,
      charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
      digits: 6,
    });
    buildOrgTeacherInviteEmail.mockResolvedValue({
      subject: 'Join Yawp!',
      text: 'text',
      html: '<p>html</p>',
    });
    sendEmail.mockResolvedValue({ status: 'success', data: { id: 'email-1' } });
  });

  test('returns sentCount for all successful deliveries', async () => {
    const response = await action({
      request: inviteRequest(
        'one@example.test, two@example.test, three@example.test'
      ),
    } as never);

    const data = unwrapData<{ sentCount: number; failedEmails: string[] }>(
      response
    );
    expect(data.sentCount).toBe(3);
    expect(data.failedEmails).toEqual([]);
    expect(teacherInviteSuccessMessage(data.sentCount)).toBe(
      'Invitations sent to 3 teachers.'
    );
    expect('success' in (data as object)).toBe(false);
  });

  test('uses singular success copy for one sent invite', async () => {
    const response = await action({
      request: inviteRequest('solo@example.test'),
    } as never);
    const data = unwrapData<{ sentCount: number; failedEmails: string[] }>(
      response
    );
    expect(data.sentCount).toBe(1);
    expect(teacherInviteSuccessMessage(data.sentCount)).toBe(
      'Invitation sent to 1 teacher.'
    );
  });

  test('tracks failedEmails when sendEmail returns status error', async () => {
    sendEmail
      .mockResolvedValueOnce({ status: 'success', data: { id: 'email-1' } })
      .mockResolvedValueOnce({
        status: 'error',
        error: { name: 'Error', message: 'fail', statusCode: 500 },
      });

    const response = await action({
      request: inviteRequest('good@example.test, bad@example.test'),
    } as never);
    const data = unwrapData<{ sentCount: number; failedEmails: string[] }>(
      response
    );
    expect(data.sentCount).toBe(1);
    expect(data.failedEmails).toEqual(['bad@example.test']);
  });

  test('returns all failed when every delivery fails with status error', async () => {
    sendEmail.mockResolvedValue({
      status: 'error',
      error: { name: 'Error', message: 'fail', statusCode: 500 },
    });

    const response = await action({
      request: inviteRequest('a@example.test, b@example.test'),
    } as never);
    const data = unwrapData<{ sentCount: number; failedEmails: string[] }>(
      response
    );
    expect(data.sentCount).toBe(0);
    expect(data.failedEmails).toEqual(['a@example.test', 'b@example.test']);
    expect(TEACHER_INVITE_ALL_FAILED_MESSAGE).toMatch(/couldn't send your invitations/);
  });

  test('never returns legacy success fields when sentCount is 0', async () => {
    sendEmail.mockResolvedValue({
      status: 'error',
      error: { name: 'Error', message: 'fail', statusCode: 500 },
    });

    const response = await action({
      request: inviteRequest('zero@example.test'),
    } as never);
    const data = unwrapData<Record<string, unknown>>(response);
    expect(data.sentCount).toBe(0);
    expect(data.success).toBeUndefined();
    expect(data.message).toBeUndefined();
  });

  test('tracks failedEmails when sendEmail throws', async () => {
    sendEmail.mockRejectedValueOnce(new Error('provider down'));

    const response = await action({
      request: inviteRequest('throws@example.test'),
    } as never);
    const data = unwrapData<{ sentCount: number; failedEmails: string[] }>(
      response
    );
    expect(data.sentCount).toBe(0);
    expect(data.failedEmails).toEqual(['throws@example.test']);
  });

  test('returns server error response when invite setup throws', async () => {
    prisma.organization.findUnique.mockRejectedValue(new Error('db down'));

    const response = (await action({
      request: inviteRequest('any@example.test'),
    } as never)) as { data: { error: string }; init: { status: number } };

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe(TEACHER_INVITE_SERVER_ERROR_MESSAGE);
  });

  // Resend and SES log `email_delivery_failed` inside sendEmail for {status:'error'};
  // the route must not add org_teacher_invite_delivery_failed on top.
  test('tracks status errors without route delivery logs (provider owns delivery logging)', async () => {
    const secretEmail = 'leaky-recipient@example.test';
    const logged: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
      originalError(...args);
    };

    try {
      sendEmail.mockResolvedValue({
        status: 'error',
        error: {
          name: 'MessageRejected',
          message: `Email address is not verified: ${secretEmail}`,
          statusCode: 400,
        },
      });

      const response = (await action({
        request: inviteRequest(secretEmail),
      } as never)) as { data: { sentCount: number; failedEmails: string[] } };

      expect(response.data.sentCount).toBe(0);
      expect(response.data.failedEmails).toEqual([secretEmail]);

      const serialized = JSON.stringify(logged);
      expect(serialized).not.toContain(secretEmail);
      expect(serialized).not.toContain('org_teacher_invite_delivery_failed');
      expect(serialized).not.toContain('email_delivery_failed');
    } finally {
      console.error = originalError;
    }
  });

  test('logs thrown delivery failures without raw recipient addresses', async () => {
    const secretEmail = 'leaky-recipient@example.test';
    const logged: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
      originalError(...args);
    };

    try {
      sendEmail.mockRejectedValue(
        Object.assign(new Error(`Provider rejected ${secretEmail}`), {
          name: 'MessageRejected',
          statusCode: 400,
        })
      );

      await action({
        request: inviteRequest(secretEmail),
      } as never);

      const serialized = JSON.stringify(logged);
      expect(serialized).not.toContain(secretEmail);
      expect(serialized).toContain('org_teacher_invite_delivery_failed');
      expect(serialized).toContain('l***@e***');
    } finally {
      console.error = originalError;
    }
  });

  test('logs invite setup failures without error messages', async () => {
    const logged: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
      originalError(...args);
    };

    try {
      prisma.organization.findUnique.mockRejectedValue(
        Object.assign(new Error('db connection leaked-secret-token'), {
          name: 'PrismaClientKnownRequestError',
          code: 'P1001',
        })
      );

      const response = (await action({
        request: inviteRequest('any@example.test'),
      } as never)) as {
        data: { error: string };
        init: { status: number };
      };

      expect(response.init?.status).toBe(500);
      expect(response.data.error).toBe(TEACHER_INVITE_SERVER_ERROR_MESSAGE);

      const serialized = JSON.stringify(logged);
      expect(serialized).toContain('org_teacher_invite_failed');
      expect(serialized).toContain('PrismaClientKnownRequestError');
      expect(serialized).toContain('P1001');
      expect(serialized).not.toContain('leaked-secret-token');
    } finally {
      console.error = originalError;
    }
  });
});
