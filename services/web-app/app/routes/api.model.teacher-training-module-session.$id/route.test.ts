import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { redirect } from 'react-router';

/**
 * The row that already exists, owned by a teacher who is not the caller. Both the
 * update and updateMany mocks answer from this fixture rather than from a canned value,
 * so a route whose where clause carries only the id really does write to -- and return
 * -- somebody else's session.
 */
const INITIAL_SESSION = {
  id: 'session-victim',
  teacherTrainingModuleId: 'module-1',
  membershipId: 'profile-victim',
  videoTimestamp: 42,
};

// Mutable, so a write that the where clause does let through is visible to the
// subsequent read -- as it would be in the database.
let VICTIM_SESSION = { ...INITIAL_SESSION };

function matchesSession(where: any) {
  if (where?.id !== VICTIM_SESSION.id) return false;
  if ('membershipId' in (where ?? {})) {
    return where.membershipId === VICTIM_SESSION.membershipId;
  }
  return true;
}

const prisma = {
  teacherTrainingModuleSession: {
    update: mock(),
    updateMany: mock(),
    findFirst: mock(),
  },
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

function updateRequest(id: string) {
  return new Request(
    `https://example.com/api/model/teacher-training-module-session/${id}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ videoTimestamp: 0 }),
    }
  );
}

async function readBody(response: any) {
  return typeof response?.json === 'function' ? response.json() : response?.data;
}

describe('api.model.teacher-training-module-session.$id authorization', () => {
  beforeEach(() => {
    prisma.teacherTrainingModuleSession.update.mockReset();
    prisma.teacherTrainingModuleSession.updateMany.mockReset();
    prisma.teacherTrainingModuleSession.findFirst.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireMutableRequest.mockReset();
    VICTIM_SESSION = { ...INITIAL_SESSION };

    requireMutableRequest.mockResolvedValue(undefined);
    requireUserId.mockResolvedValue('user-attacker');
    requireMembership.mockResolvedValue({
      id: 'profile-attacker',
      role: 'TEACHER',
    });

    prisma.teacherTrainingModuleSession.update.mockImplementation(
      async ({ where, data }: any) => {
        if (!matchesSession(where)) {
          throw Object.assign(new Error('Record to update not found'), {
            code: 'P2025',
          });
        }
        VICTIM_SESSION = { ...VICTIM_SESSION, ...data };
        return VICTIM_SESSION;
      }
    );
    prisma.teacherTrainingModuleSession.updateMany.mockImplementation(
      async ({ where, data }: any) => {
        if (!matchesSession(where)) return { count: 0 };
        VICTIM_SESSION = { ...VICTIM_SESSION, ...data };
        return { count: 1 };
      }
    );
    prisma.teacherTrainingModuleSession.findFirst.mockImplementation(
      async ({ where }: any) => (matchesSession(where) ? VICTIM_SESSION : null)
    );
  });

  test('refuses a request with no session at all', async () => {
    requireUserId.mockImplementation(() => {
      throw redirect('/auth/login');
    });

    await expect(
      action({
        request: updateRequest('session-victim'),
        params: { id: 'session-victim' },
      } as any)
    ).rejects.toBeDefined();

    expect(prisma.teacherTrainingModuleSession.update).not.toHaveBeenCalled();
    expect(
      prisma.teacherTrainingModuleSession.updateMany
    ).not.toHaveBeenCalled();
  });

  test("refuses to write another teacher's session, and does not return it", async () => {
    const response = (await action({
      request: updateRequest('session-victim'),
      params: { id: 'session-victim' },
    } as any)) as any;

    expect(response.init?.status).toBe(404);
    const body = await readBody(response);
    expect(JSON.stringify(body)).not.toContain('profile-victim');
    expect(JSON.stringify(body)).not.toContain('module-1');
    // The victim's video position is untouched.
    expect(VICTIM_SESSION.videoTimestamp).toBe(42);
  });

  test('lets the owning teacher update their own session', async () => {
    requireMembership.mockResolvedValue({
      id: 'profile-victim',
      role: 'TEACHER',
    });

    const response = (await action({
      request: updateRequest('session-victim'),
      params: { id: 'session-victim' },
    } as any)) as any;

    const body = await readBody(response);
    expect(body.success).toBe(true);
    expect(body.session.id).toBe('session-victim');
    expect(body.session.videoTimestamp).toBe(0);
  });
});
