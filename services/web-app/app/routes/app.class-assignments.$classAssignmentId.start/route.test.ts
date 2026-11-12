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
    request: new Request('https://example.com/app/class-assignments/ca-1/start', {
      method: 'POST',
      body: new FormData(),
    }),
    params: { classAssignmentId: 'ca-1' },
  } as any);

describe('class assignment start', () => {
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
      .mockImplementation((to: string, options?: any) => ({ to, options }));
  });

  test('delegates solo starts to openClassAssignmentForStudent', async () => {
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

  test('tells the student when their teacher has not opened groups yet', async () => {
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

  test('non-students are still turned away', async () => {
    requireMembership.mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });

    await call();

    expect(prisma.classAssignment.findFirst).not.toHaveBeenCalled();
    const [, options] = redirectWithToast.mock.calls[0];
    expect(options.description).toMatch(/Only students/i);
  });
});

describe('student start is rejected when postAt is in the future', () => {
  beforeEach(() => {
    prisma.classAssignment.findFirst.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    redirectWithToast
      .mockReset()
      .mockImplementation(
        (to: string) =>
          new Response(null, { status: 302, headers: { Location: to } })
      );

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

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error('Expected assignment-not-found redirect response');
    }
    expect(response.status).toBe(302);
    const location = response.headers.get('Location') || '';
    expect(location).toContain('/app?tab=assignments');

    const where = prisma.classAssignment.findFirst.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        OR: [
          { postAt: null },
          { postAt: expect.objectContaining({ lte: expect.any(Date) }) },
        ],
      })
    );
  });
});
