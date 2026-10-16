import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { redirect } from 'react-router';

const prisma = {
  userTour: { findUnique: mock(), upsert: mock(), createMany: mock(), deleteMany: mock() },
};
const requireUserId = mock();
const requireMembership = mock();
const isFreeTierEnabled = mock();
const isFeatureFlagEnabled = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
  isFeatureFlagEnabled,
}));

const tourWrites: Record<string, string>[] = [{ tourId: 'dashboard', status: 'completed' }, { intent: 'reset' }];
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
      prisma.userTour.createMany,
      prisma.userTour.deleteMany,
      requireUserId,
      requireMembership,
      isFreeTierEnabled,
      isFeatureFlagEnabled,
    ]) {
      fn.mockReset();
    }
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      role: 'TEACHER',
      organization: { id: 'org-free', plan: 'FREE_CLASSROOM' },
    });
    isFreeTierEnabled.mockResolvedValue(true);
    isFeatureFlagEnabled.mockResolvedValue(true);
    prisma.userTour.findUnique.mockResolvedValue(null);
    prisma.userTour.upsert.mockResolvedValue({});
    prisma.userTour.createMany.mockResolvedValue({ count: 1 });
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

  test('skips can only insert missing progress and never update a finished tour', async () => {
    const response = (await post({
      tourId: 'dashboard',
      status: 'dismissed',
    })) as Response;

    expect(response.status).toBe(200);
    expect(prisma.userTour.upsert).not.toHaveBeenCalled();
    expect(prisma.userTour.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', tourId: 'dashboard', status: 'dismissed' }],
      skipDuplicates: true,
    });
  });

  test('overlapping completion and skip preserve completion regardless of stale reads', async () => {
    let stored: { status: string } | null = null;
    let completionWritten!: () => void;
    const completed = new Promise<void>((resolve) => { completionWritten = resolve; });
    // Both requests can read the same absent row before either writes.
    prisma.userTour.findUnique.mockImplementation(async () => stored ? { ...stored } : null);
    prisma.userTour.upsert.mockImplementation(async ({ create, update }) => {
      // Reproduce a slow Skip request arriving after Finish from another tab.
      if (create.status === 'dismissed') await completed;
      stored = stored ? { ...stored, ...update } : { status: create.status };
      if (create.status === 'completed') completionWritten();
      return stored;
    });
    prisma.userTour.createMany.mockImplementation(async ({ data }) => {
      await completed;
      if (stored) return { count: 0 };
      stored = { status: data[0].status };
      return { count: 1 };
    });
    const responses = await Promise.all([
      post({ tourId: 'dashboard', status: 'completed' }),
      post({ tourId: 'dashboard', status: 'dismissed' }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(stored).toEqual({ status: 'completed' });
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
    expect(prisma.userTour.createMany).not.toHaveBeenCalled();
  });

  test('is not found for paid accounts, students, or with the flag off', async () => {
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
      organization: { id: 'org-free', plan: 'FREE_CLASSROOM' },
    });
    expect(
      ((await post({ tourId: 'dashboard', status: 'completed' })) as Response)
        .status
    ).toBe(404);

    requireMembership.mockResolvedValue({
      role: 'TEACHER',
      organization: { id: 'org-free', plan: 'FREE_CLASSROOM' },
    });
    isFreeTierEnabled.mockResolvedValue(false);
    expect(
      ((await post({ tourId: 'dashboard', status: 'completed' })) as Response)
        .status
    ).toBe(404);

    expect(prisma.userTour.upsert).not.toHaveBeenCalled();
    expect(prisma.userTour.createMany).not.toHaveBeenCalled();
  });

  test('a forged completion or reset cannot bypass the independent tour flag', async () => {
    isFeatureFlagEnabled.mockResolvedValue(false);
    for (const fields of tourWrites) {
      expect((await post(fields)).status).toBe(404);
    }
    expect(prisma.userTour.findUnique).not.toHaveBeenCalled();
    expect(prisma.userTour.upsert).not.toHaveBeenCalled();
    expect(prisma.userTour.createMany).not.toHaveBeenCalled();
    expect(prisma.userTour.deleteMany).not.toHaveBeenCalled();
  });

  test('uses the authenticated identity and organization, ignoring forged ids', async () => {
    await post({ tourId: 'dashboard', status: 'completed', userId: 'victim', orgId: 'paid' });
    expect(isFeatureFlagEnabled).toHaveBeenCalledWith('guided-tours', 'org-free');
    expect(prisma.userTour.upsert.mock.calls[0][0].create.userId).toBe('user-1');
  });

  test('read-only auth rejects completion and reset before database access', async () => {
    requireUserId.mockImplementation(() => { throw new Response('Read-only impersonation active', { status: 403 }); });
    for (const fields of tourWrites) {
      try { await post(fields); throw new Error('Expected rejection'); }
      catch (error) { expect(error).toBeInstanceOf(Response); expect((error as Response).status).toBe(403); }
    }
    expect(prisma.userTour.upsert).not.toHaveBeenCalled();
    expect(prisma.userTour.createMany).not.toHaveBeenCalled();
    expect(prisma.userTour.deleteMany).not.toHaveBeenCalled();
  });

  test('requires a session', async () => {
    requireUserId.mockImplementation(() => {
      throw redirect('/auth/login');
    });
    await expect(
      post({ tourId: 'dashboard', status: 'completed' })
    ).rejects.toBeInstanceOf(Response);
    expect(prisma.userTour.upsert).not.toHaveBeenCalled();
    expect(prisma.userTour.createMany).not.toHaveBeenCalled();
  });

  test('restart clears every tour for this user only', async () => {
    prisma.userTour.deleteMany.mockResolvedValue({ count: 3 });

    const response = (await post({ intent: 'reset' })) as Response;

    expect(response.status).toBe(200);
    expect(prisma.userTour.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.userTour.upsert).not.toHaveBeenCalled();
    expect(prisma.userTour.createMany).not.toHaveBeenCalled();
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
