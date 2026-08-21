import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { classAssignment: { findFirst: mock() } };
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

describe('student start is rejected when postAt is in the future', () => {
  beforeEach(() => {
    prisma.classAssignment.findFirst.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1' },
    });
  });

  test('findFirst applies postAt visibility gate and rejects', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);

    const response = await action({
      request: new Request(
        'https://example.test/app/class-assignments/ca-1/start',
        { method: 'POST', body: new FormData() }
      ),
      params: { classAssignmentId: 'ca-1' },
      context: {} as never,
    } as any);

    // Redirect back to assignments with a toast
    expect((response as any).init?.status ?? 200).toBe(302);
    const location =
      ((response as any).init?.headers?.get?.('Location') as string) || '';
    expect(location).toContain('/app?tab=assignments');

    // The query included the visibility gate on postAt
    const where = prisma.classAssignment.findFirst.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        OR: [{ postAt: null }, { postAt: expect.objectContaining({ lte: expect.any(Date) }) }],
      })
    );
  });
});

