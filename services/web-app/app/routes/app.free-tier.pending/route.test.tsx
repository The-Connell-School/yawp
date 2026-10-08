import { expect, mock, test } from 'bun:test';

test('resend is blocked unless application status is SENT', async () => {
  mock.module('~/utils/auth.server', () => ({
    requireUserId: async () => 'user-1',
  }));
  mock.module('~/utils/db.server', () => ({
    prisma: {
      freeTierApplication: {
        findFirst: async () => null,
      },
    },
  }));
  const { action } = await import('./route');
  const result = await action({
    request: new Request('https://yawp.test/app/free-tier/pending', {
      method: 'POST',
      body: new URLSearchParams({ intent: 'resend' }),
    }),
  } as never);
  expect(result).toEqual({ ok: false, reason: 'not_allowed' });
});
