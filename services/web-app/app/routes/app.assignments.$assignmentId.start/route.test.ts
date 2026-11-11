import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findFirst: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const openClassAssignmentForStudent = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
const actualOpenClassAssignment =
  globalThis.__realModules['~/domain/assignments/open-class-assignment.server'];
mock.module('~/domain/assignments/open-class-assignment.server', () => ({
  openClassAssignmentForStudent,
}));
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
  if (actualOpenClassAssignment) {
    mock.module('~/domain/assignments/open-class-assignment.server', () =>
      actualOpenClassAssignment
    );
  }
});

const call = () =>
  action({
    request: new Request('https://example.com/app/assignments/a-1/start', {
      method: 'POST',
      body: new FormData(),
    }),
    params: { assignmentId: 'a-1' },
  } as any);

describe('assignment start', () => {
  beforeEach(() => {
    prisma.classAssignment.findFirst.mockReset();
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset().mockResolvedValue({
      id: 'member-1',
      role: 'STUDENT',
    });
    openClassAssignmentForStudent
      .mockReset()
      .mockResolvedValue({ ok: true, url: '/app/documents/doc-solo?spa=1' });
    redirectWithToast
      .mockReset()
      .mockImplementation((to: string, options: any) => ({ to, options }));
  });

  test('delegates to openClassAssignmentForStudent for posted enrollments', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue({ id: 'ca-1' });

    const result: any = await call();

    expect(openClassAssignmentForStudent).toHaveBeenCalledWith({
      classAssignmentId: 'ca-1',
      membershipId: 'member-1',
    });
    expect(result.to).toContain('/app/documents/doc-solo');
  });

  test('opens the group draft when the shared helper returns a collab URL', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue({ id: 'ca-1' });
    openClassAssignmentForStudent.mockResolvedValue({
      ok: true,
      url: '/app/collab-documents/doc-group?exitTo=%2Fapp%3Ftab%3Dassignments',
    });

    const result: any = await call();

    expect(result.to).toContain('/app/collab-documents/doc-group');
    expect(result.options.description).toBe('Opening your group document.');
  });

  test('surfaces groups-not-open errors from the shared helper', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue({ id: 'ca-1' });
    openClassAssignmentForStudent.mockResolvedValue({
      ok: false,
      reason: 'groups-not-open',
      message: 'Your teacher has not opened groups for this assignment yet.',
    });

    const result: any = await call();

    expect(result.options.type).toBe('error');
    expect(result.options.description).toMatch(/not opened groups/i);
  });

  test('non-students are turned away', async () => {
    requireMembership.mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });

    const result: any = await call();

    expect(openClassAssignmentForStudent).not.toHaveBeenCalled();
    expect(result.options.type).toBe('error');
  });

  test('findFirst applies postAt visibility gate', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);

    await call();

    const where = prisma.classAssignment.findFirst.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        assignmentId: 'a-1',
        OR: [
          { postAt: null },
          { postAt: expect.objectContaining({ lte: expect.any(Date) }) },
        ],
      })
    );
  });
});
