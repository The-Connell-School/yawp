import { afterAll, expect, mock, test } from 'bun:test';

afterAll(() => {
  mock.restore();
});

test('onboarding action surfaces email_failed without redirecting to pending', async () => {
  mock.module('~/utils/auth.server', () => ({
    requireUserId: async () => 'user-1',
  }));
  mock.module('~/utils/db.server', () => ({
    prisma: {
      freeTierApplication: {
        findFirst: async () => ({ id: 'app-1' }),
      },
    },
  }));
  mock.module('~/domain/free-tier/approval-flow.server', () => ({
    submitAdminDetails: async () => ({
      ok: false as const,
      reason: 'email_failed' as const,
      error: 'delivery_failed',
    }),
  }));

  const { action } = await import('./route');
  const result = await action({
    request: new Request('https://yawp.test/app/free-tier/onboarding', {
      method: 'POST',
      body: new URLSearchParams({
        adminName: 'Pat',
        adminEmail: 'pat@school.edu',
        adminRole: 'Principal',
      }),
    }),
  } as never);
  expect(result).toEqual({
    ok: false,
    reason: 'email_failed',
    error: 'delivery_failed',
  });
});
