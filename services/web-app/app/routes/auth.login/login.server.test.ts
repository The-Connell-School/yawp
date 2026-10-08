import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAnonymous = mock();
const verifyUserPassword = mock();
const getSessionExpirationDateForUser = mock();
const getSession = mock();
const commitSession = mock();
const captureException = mock();
const getPreviewAccessSeat = mock();
const setMembershipId = mock();
const consumeLoginAttemptRateLimits = mock();
const refundLoginAttemptRateLimits = mock();

const prisma = {
  orgMembership: {
    findFirst: mock(),
  },
  session: {
    create: mock(),
  },
};

mock.module('~/utils/auth.server', () => ({
  getSessionExpirationDateForUser,
  requireAnonymous,
  sessionKey: 'sessionId',
  verifyUserPassword,
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/cookie-session-storages/authentication.server', () => ({
  authSessionStorage: {
    getSession,
    commitSession,
  },
}));
mock.module('~/services/posthog.server', () => ({
  posthog: {
    captureException,
  },
}));
mock.module('~/utils/preview-access.server', () => ({
  getPreviewAccessSeat,
  isIsolatedPreviewSeatMode: () => false,
}));
mock.module('~/cookies/membership-id.server', () => ({ setMembershipId }));
mock.module('~/utils/rate-limit.server', () => ({
  consumeLoginAttemptRateLimits,
  refundLoginAttemptRateLimits,
  rateLimitedFormResponse: (
    field: string,
    retryAfterSeconds: number,
    message: string
  ) =>
    ({
      status: 429,
      field,
      retryAfterSeconds,
      message,
    }) as unknown as Response,
}));

const { loginAction } = await import('./login.server');

function loginRequest(email: string, password: string) {
  const form = new FormData();
  form.append('email', email);
  form.append('password', password);
  return new Request('https://example.com/auth/login', {
    method: 'POST',
    body: form,
  });
}

describe('loginAction rate limits', () => {
  beforeEach(() => {
    requireAnonymous.mockReset();
    verifyUserPassword.mockReset();
    getSessionExpirationDateForUser.mockReset();
    getSession.mockReset();
    commitSession.mockReset();
    consumeLoginAttemptRateLimits.mockReset();
    refundLoginAttemptRateLimits.mockReset();
    prisma.session.create.mockReset();

    getSessionExpirationDateForUser.mockReturnValue(
      new Date('2026-01-01T00:00:00.000Z')
    );
    getSession.mockResolvedValue({ set: mock() });
    commitSession.mockResolvedValue('auth=cookie');
    consumeLoginAttemptRateLimits.mockResolvedValue({
      allowed: true,
      charged: [{ key: 'test-bucket', capacity: 1, refillPerMs: 1, cost: 1 }],
    });
    verifyUserPassword.mockResolvedValue({
      id: 'user-1',
      email: 'teacher@example.com',
      mustChangePassword: false,
    });
    prisma.session.create.mockResolvedValue({
      id: 'session-1',
      expirationDate: new Date('2026-01-01T00:00:00.000Z'),
      userId: 'user-1',
    });
  });

  test('returns 429 without verifying the password when a bucket is exhausted', async () => {
    consumeLoginAttemptRateLimits.mockResolvedValue({
      allowed: false,
      scope: 'ip',
      retryAfterSeconds: 120,
    });

    const response = await loginAction({
      request: loginRequest('student@example.com', 'correct-password'),
    } as any);

    expect(response).toMatchObject({ status: 429 });
    expect(verifyUserPassword).not.toHaveBeenCalled();
  });

  test('refunds consumed buckets after a successful login', async () => {
    const charged = [{ key: 'ip-bucket', capacity: 12, refillPerMs: 1, cost: 1 }];
    consumeLoginAttemptRateLimits.mockResolvedValue({ allowed: true, charged });

    const response = (await loginAction({
      request: loginRequest('teacher@example.com', 'password1234'),
    } as any)) as Response;

    expect(response.status).toBe(302);
    expect(refundLoginAttemptRateLimits).toHaveBeenCalledWith(charged);
  });

  test('does not refund buckets after a failed password check', async () => {
    verifyUserPassword.mockResolvedValue(null);

    await loginAction({
      request: loginRequest('teacher@example.com', 'wrong'),
    } as any);

    expect(refundLoginAttemptRateLimits).not.toHaveBeenCalled();
    expect(verifyUserPassword).toHaveBeenCalled();
  });

  test('denies login when the limiter fails closed', async () => {
    consumeLoginAttemptRateLimits.mockResolvedValue({
      allowed: false,
      scope: 'ip',
      retryAfterSeconds: 60,
    });

    await loginAction({
      request: loginRequest('spray-target@example.com', 'right-password'),
    } as any);

    expect(verifyUserPassword).not.toHaveBeenCalled();
  });

  test('parallel attempts only verify passwords for requests that pass the limiter', async () => {
    let allowed = 0;
    consumeLoginAttemptRateLimits.mockImplementation(async () => {
      allowed += 1;
      if (allowed > 2) {
        return { allowed: false, scope: 'ip', retryAfterSeconds: 30 };
      }
      return { allowed: true, charged: [] };
    });

    await Promise.all(
      Array.from({ length: 5 }, () =>
        loginAction({
          request: loginRequest('burst@example.com', 'pw'),
        } as any)
      )
    );

    expect(verifyUserPassword).toHaveBeenCalledTimes(2);
  });
});
