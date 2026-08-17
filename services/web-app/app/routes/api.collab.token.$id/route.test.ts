import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

// Only the database and session are mocked. document-access.server runs for
// real, so these tests exercise the actual documentAuthorWhere/documentReadWhere
// predicates rather than a stand-in for them.
const prisma = {
  document: {
    findFirst: mock(),
  },
  user: {
    findUnique: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

function responseStatus(response: any) {
  return response.status ?? response.init?.status;
}

const call = (id = 'doc-1') =>
  action({
    request: new Request(`https://example.com/api/collab/token/${id}`, {
      method: 'POST',
    }),
    params: { id },
  } as any);

const decodePayload = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

/**
 * The route runs up to three queries: the "is this a collaborative room" gate,
 * then author scope, then read scope. Each helper queues the answers in order.
 */
const queue = (...results: unknown[]) => {
  prisma.document.findFirst.mockReset();
  for (const result of results) {
    prisma.document.findFirst.mockResolvedValueOnce(result);
  }
  prisma.document.findFirst.mockResolvedValue(null);
};

const ROOM = { id: 'doc-1' };

describe('api.collab.token.$id', () => {
  beforeEach(() => {
    process.env.TIPTAP_COLLAB_SECRET = 'test-collab-secret';
    process.env.TIPTAP_COLLAB_APP_ID = 'app-123';

    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset().mockResolvedValue({
      id: 'member-1',
      role: 'STUDENT',
    });
    prisma.user.findUnique.mockReset().mockResolvedValue({ isAdmin: false });
    prisma.document.findFirst.mockReset();
  });

  test('mints a write-scoped token for an author', async () => {
    queue(ROOM, ROOM);

    const response = await call();
    const body = await readBody(response);

    expect(body.readOnly).toBe(false);
    expect(body.documentName).toBe('doc-1');
    expect(body.appId).toBe('app-123');

    const payload = decodePayload(body.token);
    expect(payload.sub).toBe('member-1');
    expect(payload.allowedDocumentNames).toEqual(['doc-1']);
    expect(payload.readOnly).toBe(false);
  });

  test('mints a read-only token for someone with read but not author access', async () => {
    // A teacher of the owning student's class: reads and comments, never writes
    // into student prose.
    queue(ROOM, null, ROOM);
    requireMembership.mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });

    const body = await readBody(await call());

    expect(body.readOnly).toBe(true);
    expect(decodePayload(body.token).readOnly).toBe(true);
  });

  test('refuses someone with no access to the document', async () => {
    queue(ROOM, null, null);

    const response = await call();

    expect(responseStatus(response)).toBe(403);
    expect((await readBody(response)).token).toBeUndefined();
  });

  test('refuses a document that is not an opened collaboration room', async () => {
    // The gate query returns nothing when the assignment is not collaborative,
    // the organization is not in the rollout, or the group has not been opened.
    // No token is minted for an ordinary solo document.
    queue(null);

    const response = await call();

    expect(responseStatus(response)).toBe(403);
    expect((await readBody(response)).token).toBeUndefined();
    // Cheapest check first: it must not go on to probe access scopes.
    expect(prisma.document.findFirst).toHaveBeenCalledTimes(1);
  });

  test('scopes the room gate to an opened group on either road', async () => {
    queue(ROOM, ROOM);

    await call();

    const where = prisma.document.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('doc-1');
    // An opened group is required whichever road produced it.
    expect(where.group).toEqual({ is: { openedAt: { not: null } } });

    // Teacher-arranged work needs the assignment toggle and the drafts gate;
    // a student share needs the sharing gate and has no assignment.
    const [assignmentRoad, studentRoad] = where.OR;
    expect(assignmentRoad).toEqual({
      group: { is: { kind: 'assignment' } },
      assignment: { is: { collaborationEnabled: true } },
      membership: {
        is: { organization: { is: { collaborativeDraftsEnabled: true } } },
      },
    });
    expect(studentRoad).toEqual({
      group: { is: { kind: 'student-share' } },
      membership: {
        is: { organization: { is: { studentDocumentSharingEnabled: true } } },
      },
    });
  });

  test('fails without leaking a token when the provider secret is missing', async () => {
    delete process.env.TIPTAP_COLLAB_SECRET;
    queue(ROOM, ROOM);

    const response = await call();

    expect(responseStatus(response)).toBe(500);
    expect((await readBody(response)).token).toBeUndefined();
  });

  test('a platform admin gets a write token', async () => {
    prisma.user.findUnique.mockResolvedValue({ isAdmin: true });
    queue(ROOM, ROOM);

    const body = await readBody(await call());

    expect(body.readOnly).toBe(false);
  });

  test('rejects a request with no document id', async () => {
    const response = await action({
      request: new Request('https://example.com/api/collab/token/', {
        method: 'POST',
      }),
      params: {},
    } as any);

    expect(responseStatus(response)).toBe(400);
    expect(prisma.document.findFirst).not.toHaveBeenCalled();
  });
});
