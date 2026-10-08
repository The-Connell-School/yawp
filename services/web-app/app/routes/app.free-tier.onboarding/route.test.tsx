import { expect, mock, test } from 'bun:test';

mock.module('~/domain/free-tier/approval-flow.server', () => ({
  submitAdminDetails: async () => ({ ok: true as const, status: 'SENT' as const }),
}));

test('onboarding action redirects without returning approval tokens', async () => {
  const { action } = await import('./route');
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

  const response = await action({
    request: new Request('https://yawp.test/app/free-tier/onboarding', {
      method: 'POST',
      body: new URLSearchParams({
        adminName: 'Pat',
        adminEmail: 'pat@school.edu',
        adminRole: 'Principal',
      }),
    }),
  } as never);

  expect(response).toBeInstanceOf(Response);
  const res = response as Response;
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('/app/free-tier/pending');
  const body = await res.text();
  expect(body).not.toContain('approveToken');
  expect(body).not.toContain('declineToken');
});
