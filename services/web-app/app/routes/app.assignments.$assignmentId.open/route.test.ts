import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { redirect } from 'react-router';

const prisma = {
  assignment: { findUnique: mock() },
  classAssignment: { findFirst: mock(), findMany: mock() },
  orgMembership: { findFirst: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const openClassAssignmentForStudent = mock();
const setMembershipId = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
const actualOpenClassAssignment =
  globalThis.__realModules['~/domain/assignments/open-class-assignment.server'];
mock.module('~/domain/assignments/open-class-assignment.server', () => ({
  openClassAssignmentForStudent,
}));
mock.module('~/cookies/membership-id.server', () => ({ setMembershipId }));
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
  if (actualOpenClassAssignment) {
    mock.module('~/domain/assignments/open-class-assignment.server', () =>
      actualOpenClassAssignment
    );
  }
});

const args = (assignmentId = 'a-1') =>
  ({
    request: new Request(
      `https://example.test/app/assignments/${assignmentId}/open`
    ),
    params: { assignmentId },
    context: {},
  }) as any;

async function readLoader(result: unknown) {
  if (result instanceof Response) return result;
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: unknown; init?: { headers?: HeadersInit } }).data;
  }
  return result;
}

describe('assignment open loader', () => {
  beforeEach(() => {
    prisma.assignment.findUnique.mockReset().mockResolvedValue({ id: 'a-1' });
    prisma.classAssignment.findFirst.mockReset();
    prisma.classAssignment.findMany.mockReset();
    prisma.orgMembership.findFirst.mockReset();
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset().mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
    });
    openClassAssignmentForStudent.mockReset();
    setMembershipId.mockReset().mockResolvedValue('membership=alt');
    redirectWithToast.mockReset().mockImplementation((to: string) => redirect(to));
  });

  test('signed-out users redirect to login with redirectTo', async () => {
    const openPath = '/app/assignments/a-1/open';
    requireUserId.mockImplementation(() => {
      throw redirect(
        `/auth/login?${new URLSearchParams({ redirectTo: openPath }).toString()}`
      );
    });

    await expect(loader(args())).rejects.toMatchObject({
      status: 302,
      headers: expect.objectContaining({
        get: expect.any(Function),
      }),
    });
    try {
      await loader(args());
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const location = (error as Response).headers.get('Location') || '';
      expect(location).toBe(
        `/auth/login?redirectTo=${encodeURIComponent(openPath)}`
      );
    }
  });

  test('redirects enrolled students to their document', async () => {
    prisma.classAssignment.findMany.mockResolvedValue([
      { id: 'ca-1', postAt: null },
    ]);
    openClassAssignmentForStudent.mockResolvedValue({
      ok: true,
      url: '/app/documents/doc-1?spa=1',
    });

    await expect(loader(args())).rejects.toMatchObject({ status: 302 });
    try {
      await loader(args());
    } catch (error) {
      expect((error as Response).headers.get('Location')).toContain(
        '/app/documents/doc-1'
      );
    }
  });

  test('renders not-posted without creating a document', async () => {
    const future = new Date(Date.now() + 86_400_000);
    prisma.classAssignment.findMany.mockResolvedValue([
      { id: 'ca-1', postAt: future },
    ]);

    const data = await readLoader(await loader(args()));

    expect(data).toEqual({
      state: 'not-posted',
      opensAt: future.toISOString(),
    });
    expect(openClassAssignmentForStudent).not.toHaveBeenCalled();
  });

  test('renders not-in-class when the student is not enrolled', async () => {
    prisma.classAssignment.findMany.mockResolvedValue([]);
    prisma.orgMembership.findFirst.mockResolvedValue(null);

    const data = await readLoader(await loader(args()));

    expect(data).toEqual({ state: 'not-in-class' });
  });

  test('renders groups-not-open for collaborative assignments', async () => {
    prisma.classAssignment.findMany.mockResolvedValue([
      { id: 'ca-1', postAt: null },
    ]);
    openClassAssignmentForStudent.mockResolvedValue({
      ok: false,
      reason: 'groups-not-open',
      message: 'Your teacher has not opened groups for this assignment yet.',
    });

    const data = await readLoader(await loader(args()));

    expect(data).toEqual({ state: 'groups-not-open' });
  });

  test('redirects teachers who teach the assignment to the detail page', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
    });
    prisma.classAssignment.findFirst.mockResolvedValue({ id: 'ca-1' });

    await expect(loader(args())).rejects.toMatchObject({ status: 302 });
    try {
      await loader(args());
    } catch (error) {
      expect((error as Response).headers.get('Location')).toBe(
        '/app/assignments/a-1'
      );
    }
  });

  test('switches membership when another active membership is enrolled', async () => {
    prisma.classAssignment.findMany.mockResolvedValue([]);
    prisma.orgMembership.findFirst.mockResolvedValue({ id: 'student-2' });

    await expect(loader(args())).rejects.toMatchObject({ status: 302 });
    try {
      await loader(args());
    } catch (error) {
      const response = error as Response;
      expect(response.headers.get('Location')).toBe('/app/assignments/a-1/open');
      expect(response.headers.get('set-cookie')).toBe('membership=alt');
    }
    expect(setMembershipId).toHaveBeenCalledWith('student-2');
  });
});
