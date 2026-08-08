import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  document: { findMany: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

describe('my documents route', () => {
  beforeEach(() => {
    prisma.document.findMany.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
  });

  test('redirects a teacher to the teacher documents/grading surface', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });

    await expect(
      loader({
        request: new Request('https://example.test/app/my-documents'),
        params: {},
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 302 });
  });

  test('groups a student’s documents by class, unassigned documents last', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-practice',
        title: 'Free write',
        updatedAt: new Date(),
        classAssignment: null,
        assignmentModuleSessions: [],
        submissions: [],
      },
      {
        id: 'doc-history',
        title: 'DBQ Draft',
        updatedAt: new Date(),
        classAssignment: {
          class: { id: 'class-history', grade: '9', period: '1', title: 'History' },
        },
        assignmentModuleSessions: [],
        submissions: [],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/my-documents'),
      params: {},
      context: {} as never,
    } as any);

    expect(prisma.document.findMany.mock.calls[0][0].where).toMatchObject({
      membershipId: 'profile-1',
      deletedAt: null,
      archivedAt: null,
    });
    expect(response.data.documentCount).toBe(2);
    expect(response.data.groups.map((g: any) => g.classId)).toEqual([
      'class-history',
      null,
    ]);
  });
});
