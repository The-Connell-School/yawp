import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { redirect } from 'react-router';

/**
 * A stand-in for the compound-unique row that already exists in the database, owned by
 * a teacher who is not the caller. The findUnique mock below answers from this table
 * rather than from a canned value, so a route that passes the body's `membershipId`
 * straight through really does hand back the victim's progress -- which is what the
 * pre-fix run demonstrates.
 */
const VICTIM_SESSION = {
  id: 'session-victim',
  teacherTrainingModuleId: 'module-1',
  membershipId: 'profile-victim',
  videoTimestamp: 42,
};

const prisma = {
  teacherTrainingModuleSession: { findUnique: mock(), create: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const requireMutableRequest = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
  requireMutableRequest,
}));

const { action } = await import('./route');

function sessionRequest(body: Record<string, unknown>) {
  return new Request(
    'https://example.com/api/model/teacher-training-module-session',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

async function readBody(response: any) {
  return typeof response?.json === 'function' ? response.json() : response?.data;
}

describe('api.model.teacher-training-module-session authorization', () => {
  beforeEach(() => {
    prisma.teacherTrainingModuleSession.findUnique.mockReset();
    prisma.teacherTrainingModuleSession.create.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireMutableRequest.mockReset();

    requireMutableRequest.mockResolvedValue(undefined);
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue({
      id: 'profile-teacher',
      role: 'TEACHER',
    });

    prisma.teacherTrainingModuleSession.findUnique.mockImplementation(
      async ({ where }: any) => {
        const key = where?.teacherTrainingModuleId_membershipId;
        if (
          key?.teacherTrainingModuleId ===
            VICTIM_SESSION.teacherTrainingModuleId &&
          key?.membershipId === VICTIM_SESSION.membershipId
        ) {
          return VICTIM_SESSION;
        }
        return null;
      }
    );
    prisma.teacherTrainingModuleSession.create.mockImplementation(
      async ({ data }: any) => ({ id: 'session-created', ...data })
    );
  });

  test('refuses a request with no session at all', async () => {
    // requireMutableRequest returns normally when there is no session cookie, so the
    // route has to authenticate for itself.
    requireUserId.mockImplementation(() => {
      throw redirect('/auth/login');
    });

    await expect(
      action({
        request: sessionRequest({
          teacherTrainingModuleId: 'module-1',
          membershipId: 'profile-victim',
        }),
        params: {},
      } as any)
    ).rejects.toBeDefined();

    expect(
      prisma.teacherTrainingModuleSession.findUnique
    ).not.toHaveBeenCalled();
    expect(prisma.teacherTrainingModuleSession.create).not.toHaveBeenCalled();
  });

  test("ignores a membershipId in the body and never returns another teacher's session", async () => {
    const response = (await action({
      request: sessionRequest({
        teacherTrainingModuleId: 'module-1',
        membershipId: 'profile-victim',
      }),
      params: {},
    } as any)) as any;

    const body = await readBody(response);
    expect(body.session.id).not.toBe('session-victim');
    expect(body.session.membershipId).toBe('profile-teacher');
    expect(body.session.videoTimestamp).toBe(0);
  });

  test("creates the session against the caller's own membership", async () => {
    await action({
      request: sessionRequest({ teacherTrainingModuleId: 'module-1' }),
      params: {},
    } as any);

    expect(prisma.teacherTrainingModuleSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teacherTrainingModuleId: 'module-1',
          membershipId: 'profile-teacher',
          videoTimestamp: 0,
        }),
      })
    );
  });

  test('returns the caller-owned session when one already exists', async () => {
    requireMembership.mockResolvedValue({
      id: 'profile-victim',
      role: 'TEACHER',
    });

    const response = (await action({
      request: sessionRequest({ teacherTrainingModuleId: 'module-1' }),
      params: {},
    } as any)) as any;

    const body = await readBody(response);
    expect(body.session.id).toBe('session-victim');
    expect(prisma.teacherTrainingModuleSession.create).not.toHaveBeenCalled();
  });

  test('still rejects a request with no module id', async () => {
    await expect(
      action({ request: sessionRequest({}), params: {} } as any)
    ).rejects.toBeDefined();
  });
});
