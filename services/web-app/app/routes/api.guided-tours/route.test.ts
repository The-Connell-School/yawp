import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { redirect } from 'react-router';

const prisma = {
  userTour: { findUnique: mock(), upsert: mock(), deleteMany: mock() },
};
const requireUserId = mock();
const requireMembership = mock();
const isFreeTierEnabled = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
}));

const { action } = await import('./route');

function post(fields: Record<string, string>, method = 'POST') {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return action({
    request: new Request('https://example.com/api/guided-tours', {
      method,
      ...(method === 'POST' ? { body } : {}),
    }),
    params: {},
  } as any);
}

describe('api.guided-tours', () => {
  beforeEach(() => {
    for (const fn of [
      prisma.userTour.findUnique,
      prisma.userTour.upsert,
      prisma.userTour.deleteMany,
      requireUserId,
      requireMembership,
      isFreeTierEnabled,
    ]) {
      fn.mockReset();
    }
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      role: 'TEACHER',
      organization: { plan: 'FREE_CLASSROOM' },
    });
    isFreeTierEnabled.mockResolvedValue(true);
    prisma.userTour.findUnique.mockResolvedValue(null);
    prisma.userTour.upsert.mockResolvedValue({});
  });

  test('records how a free classroom teacher left a tour', async () => {
    const response = (await post({
      tourId: 'dashboard',
      status: 'completed',
    })) as Response;

    expect(response.status).toBe(200);
    expect(prisma.userTour.upsert).toHaveBeenCalledWith({
      where: { userId_tourId: { userId: 'user-1', tourId: 'dashboard' } },
      create: { userId: 'user-1', tourId: 'dashboard', status: 'completed' },
      update: { status: 'completed' },
    });
  });

  test('never downgrades a finished tour to skipped', async () => {
    prisma.userTour.findUnique.mockResolvedValue({ status: 'completed' });

    const response = (await post({
      tourId: 'dashboard',
      status: 'dismissed',
    })) as Response;

    expect(response.status).toBe(200);
    expect(prisma.userTour.upsert).not.toHaveBeenCalled();
  });

  test('rejects unknown tours and statuses without writing', async () => {
    const badTour = (await post({
      tourId: 'admin',
      status: 'completed',
    })) as Response;
    const badStatus = (await post({
      tourId: 'dashboard',
      status: 'started',
    })) as Response;

    expect(badTour.status).toBe(400);
    expect(badStatus.status).toBe(400);
    expect(prisma.userTour.upsert).not.toHaveBeenCalled();
  });

  test('is not found for paid schools, students, or with the flag off', async () => {
    requireMembership.mockResolvedValue({
      role: 'TEACHER',
      organization: { plan: 'SCHOOL' },
    });
    expect(
      ((await post({ tourId: 'dashboard', status: 'completed' })) as Response)
        .status
    ).toBe(404);

    requireMembership.mockResolvedValue({
      role: 'STUDENT',
      organization: { plan: 'FREE_CLASSROOM' },
    });
    expect(
      ((await post({ tourId: 'dashboard', status: 'completed' })) as Response)
        .status
    ).toBe(404);

    requireMembership.mockResolvedValue({
      role: 'TEACHER',
      organization: { plan: 'FREE_CLASSROOM' },
    });
    isFreeTierEnabled.mockResolvedValue(false);
    expect(
      ((await post({ tourId: 'dashboard', status: 'completed' })) as Response)
        .status
    ).toBe(404);

    expect(prisma.userTour.upsert).not.toHaveBeenCalled();
  });

  test('requires a session', async () => {
    requireUserId.mockImplementation(() => {
      throw redirect('/auth/login');
    });
    await expect(
      post({ tourId: 'dashboard', status: 'completed' })
    ).rejects.toBeInstanceOf(Response);
    expect(prisma.userTour.upsert).not.toHaveBeenCalled();
  });

  test('restart clears every tour for this user only', async () => {
    prisma.userTour.deleteMany.mockResolvedValue({ count: 3 });

    const response = (await post({ intent: 'reset' })) as Response;

    expect(response.status).toBe(200);
    expect(prisma.userTour.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.userTour.upsert).not.toHaveBeenCalled();
  });

  test('restart is not found for anyone the tours are not for', async () => {
    isFreeTierEnabled.mockResolvedValue(false);
    const response = (await post({ intent: 'reset' })) as Response;
    expect(response.status).toBe(404);
    expect(prisma.userTour.deleteMany).not.toHaveBeenCalled();
  });

  test('only accepts POST', async () => {
    const response = (await post({}, 'PUT')) as Response;
    expect(response.status).toBe(405);
  });
});
