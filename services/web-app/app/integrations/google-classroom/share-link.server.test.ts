import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findFirst: mock() },
  classAssignmentShareLink: {
    findUnique: mock(),
    create: mock(),
    update: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  SHARE_TOKEN_BYTE_LENGTH,
  findShareableClassAssignmentForTeacher,
  generateShareToken,
  getOrCreateShareLink,
  recordShareLinkLaunch,
  resolveShareLinkByToken,
  revokeShareLink,
} = await import('./share-link.server');

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  prisma.classAssignment.findFirst.mockReset();
  prisma.classAssignmentShareLink.findUnique.mockReset();
  prisma.classAssignmentShareLink.create.mockReset();
  prisma.classAssignmentShareLink.update.mockReset();
});

const existingLink = (overrides: Record<string, unknown> = {}) => ({
  id: 'link-1',
  token: 'existing-token',
  classAssignmentId: 'ca-1',
  revokedAt: null,
  ...overrides,
});

describe('generateShareToken', () => {
  test('is URL-safe so it survives a round trip through a path segment', () => {
    for (let i = 0; i < 25; i++) {
      const token = generateShareToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  test('carries the full entropy budget, since these links are public', () => {
    const token = generateShareToken();
    // base64url of N bytes is ceil(N * 4 / 3) characters with padding stripped.
    expect(token.length).toBe(Math.ceil((SHARE_TOKEN_BYTE_LENGTH * 4) / 3));
    expect(SHARE_TOKEN_BYTE_LENGTH).toBeGreaterThanOrEqual(16);
  });

  test('does not repeat', () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => generateShareToken())
    );
    expect(tokens.size).toBe(200);
  });
});

describe('findShareableClassAssignmentForTeacher', () => {
  test('scopes the lookup to a class the teacher actually teaches', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);

    await findShareableClassAssignmentForTeacher({
      classAssignmentId: 'ca-1',
      membershipId: 'teacher-1',
    });

    const where = prisma.classAssignment.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('ca-1');
    expect(where.class.teachers.some.id).toBe('teacher-1');
  });

  test('returns null when the teacher does not teach the class', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);

    await expect(
      findShareableClassAssignmentForTeacher({
        classAssignmentId: 'ca-1',
        membershipId: 'other-teacher',
      })
    ).resolves.toBeNull();
  });
});

describe('getOrCreateShareLink', () => {
  test('reuses a live link so a re-share keeps the URL Classroom already hosts', async () => {
    prisma.classAssignmentShareLink.findUnique.mockResolvedValue(existingLink());

    const link = await getOrCreateShareLink({
      classAssignmentId: 'ca-1',
      membershipId: 'teacher-1',
    });

    expect(link.token).toBe('existing-token');
    expect(prisma.classAssignmentShareLink.create).not.toHaveBeenCalled();
    expect(prisma.classAssignmentShareLink.update).not.toHaveBeenCalled();
  });

  test('mints a link the first time an assignment is shared', async () => {
    prisma.classAssignmentShareLink.findUnique.mockResolvedValue(null);
    prisma.classAssignmentShareLink.create.mockImplementation(
      async ({ data }: any) => ({ id: 'link-new', ...data })
    );

    const link = await getOrCreateShareLink({
      classAssignmentId: 'ca-1',
      membershipId: 'teacher-1',
    });

    const data = prisma.classAssignmentShareLink.create.mock.calls[0][0].data;
    expect(data.classAssignmentId).toBe('ca-1');
    expect(data.createdByMembershipId).toBe('teacher-1');
    expect(data.provider).toBe('google-classroom');
    expect(link.token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('re-sharing a revoked assignment issues a fresh token, leaving the old URL dead', async () => {
    prisma.classAssignmentShareLink.findUnique.mockResolvedValue(
      existingLink({ revokedAt: new Date('2026-01-01') })
    );
    prisma.classAssignmentShareLink.update.mockImplementation(
      async ({ data }: any) => ({ id: 'link-1', ...data })
    );

    const link = await getOrCreateShareLink({
      classAssignmentId: 'ca-1',
      membershipId: 'teacher-1',
    });

    const data = prisma.classAssignmentShareLink.update.mock.calls[0][0].data;
    expect(data.revokedAt).toBeNull();
    expect(data.token).not.toBe('existing-token');
    expect(link.token).toBe(data.token);
    expect(prisma.classAssignmentShareLink.create).not.toHaveBeenCalled();
  });

  test('loses a concurrent mint race gracefully rather than 500ing the teacher', async () => {
    // Two clicks land at once: both read no row, the second create violates the
    // unique constraint on classAssignmentId.
    prisma.classAssignmentShareLink.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingLink({ token: 'winner-token' }));
    prisma.classAssignmentShareLink.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    );

    const link = await getOrCreateShareLink({
      classAssignmentId: 'ca-1',
      membershipId: 'teacher-1',
    });

    expect(link.token).toBe('winner-token');
  });
});

describe('resolveShareLinkByToken', () => {
  test('returns nothing for an unknown token', async () => {
    prisma.classAssignmentShareLink.findUnique.mockResolvedValue(null);

    await expect(resolveShareLinkByToken('nope')).resolves.toBeNull();
  });

  test('returns nothing for a revoked token, even though the row still exists', async () => {
    prisma.classAssignmentShareLink.findUnique.mockResolvedValue(
      existingLink({ revokedAt: new Date('2026-01-01') })
    );

    await expect(resolveShareLinkByToken('existing-token')).resolves.toBeNull();
  });

  test('returns the link and its class assignment for a live token', async () => {
    prisma.classAssignmentShareLink.findUnique.mockResolvedValue(existingLink());

    await expect(
      resolveShareLinkByToken('existing-token')
    ).resolves.toMatchObject({ id: 'link-1' });
  });

  test('ignores an empty token without querying', async () => {
    await expect(resolveShareLinkByToken('')).resolves.toBeNull();
    expect(prisma.classAssignmentShareLink.findUnique).not.toHaveBeenCalled();
  });
});

describe('recordShareLinkLaunch', () => {
  test('counts the launch without letting a write failure block the student', async () => {
    prisma.classAssignmentShareLink.update.mockRejectedValue(
      new Error('database is having a day')
    );

    await expect(recordShareLinkLaunch('link-1')).resolves.toBeUndefined();

    const call = prisma.classAssignmentShareLink.update.mock.calls[0][0];
    expect(call.where.id).toBe('link-1');
    expect(call.data.launchCount).toEqual({ increment: 1 });
  });
});

describe('revokeShareLink', () => {
  test('closes the link without deleting the row, so the token stays burned', async () => {
    prisma.classAssignmentShareLink.update.mockResolvedValue(
      existingLink({ revokedAt: new Date() })
    );

    await revokeShareLink({ classAssignmentId: 'ca-1' });

    const call = prisma.classAssignmentShareLink.update.mock.calls[0][0];
    expect(call.where.classAssignmentId).toBe('ca-1');
    expect(call.data.revokedAt).toBeInstanceOf(Date);
  });
});
