import { afterAll, expect, mock, test } from 'bun:test';

afterAll(() => mock.restore());

test('preview provisions locked classroom then redirects to app', async () => {
  const ensure = mock(async () => ({
    status: 'provisioned' as const,
    organizationId: 'org-1',
  }));
  mock.module('~/utils/auth.server', () => ({
    requireUserId: async () => 'teacher-1',
  }));
  mock.module('~/domain/free-tier/locked-preview.server', () => ({
    userHasPendingFreeTierTeachingLock: async () => true,
    ensureLockedPreviewClassroomForUser: ensure,
  }));
  mock.module('~/utils/db.server', () => ({
    prisma: {
      freeTierApplication: {
        findFirst: async () => ({ status: 'SENT' }),
      },
    },
  }));
  const { loader } = await import('./route');
  let res: Response;
  try {
    await loader({
      request: new Request('https://yawp.test/app/free-tier/preview'),
    } as never);
    throw new Error('expected redirect');
  } catch (response) {
    expect(response).toBeInstanceOf(Response);
    res = response as Response;
  }
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('/app');
  expect(ensure).toHaveBeenCalledWith('teacher-1');
});

test('preview redirects to pending when teaching lock is off', async () => {
  mock.module('~/utils/auth.server', () => ({
    requireUserId: async () => 'teacher-1',
  }));
  mock.module('~/domain/free-tier/locked-preview.server', () => ({
    userHasPendingFreeTierTeachingLock: async () => false,
    ensureLockedPreviewClassroomForUser: async () => null,
  }));
  const { loader } = await import('./route');
  let res: Response;
  try {
    await loader({
      request: new Request('https://yawp.test/app/free-tier/preview'),
    } as never);
    throw new Error('expected redirect');
  } catch (response) {
    res = response as Response;
  }
  expect(res.headers.get('location')).toBe('/app/free-tier/pending');
});
