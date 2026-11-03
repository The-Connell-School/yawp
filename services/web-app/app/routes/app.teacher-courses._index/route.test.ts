import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock(async () => 'user-1');
const findUnique = mock(async () => ({ email: 'other.teacher@example.com' }));

mock.module('~/utils/auth.server', () => ({
  requireUserId,
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    user: {
      findUnique,
    },
  },
}));

const { loader } = await import('./route');
const { TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS } = await import(
  '~/domain/teacher-lounge/teacher-lounge-temporary-disable'
);

describe('legacy teacher courses route', () => {
  beforeEach(() => {
    requireUserId.mockClear();
    findUnique.mockClear();
    requireUserId.mockResolvedValue('user-1');
  });

  test('redirects to the teacher dashboard while the Lounge is disabled', async () => {
    findUnique.mockResolvedValue({ email: 'other.teacher@example.com' });
    const response = await loader({ request: new Request('http://test/app/teacher-courses') } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/app');
  });

  test('redirects allowlisted teacher to teacher trainings', async () => {
    findUnique.mockResolvedValue({
      email: TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS[0],
    });
    const response = await loader({ request: new Request('http://test/app/teacher-courses') } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/app/teacher-trainings');
  });
});
