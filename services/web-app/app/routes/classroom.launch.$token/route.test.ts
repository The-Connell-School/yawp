import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { class: { findFirst: mock() } };
const requireUserId = mock();
const requireMembership = mock();
const resolveShareLinkByToken = mock();
const recordShareLinkLaunch = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));
mock.module('~/integrations/google-classroom/share-link.server', () => ({
  resolveShareLinkByToken,
  recordShareLinkLaunch,
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

const LAUNCH_URL = 'https://app.yawp.com/classroom/launch/tok_123';

const call = (token = 'tok_123') =>
  loader({
    request: new Request(LAUNCH_URL),
    params: { token },
    context: {},
  } as any);

const shareLink = (overrides: Record<string, unknown> = {}) => ({
  id: 'link-1',
  revokedAt: null,
  classAssignment: {
    id: 'ca-1',
    assignmentId: 'a-1',
    postAt: null,
    class: {
      id: 'class-1',
      title: 'AP Lang',
      period: '3',
      grade: '11',
      school: { id: 'school-1', organizationId: 'org-1' },
    },
    assignment: { id: 'a-1', title: 'Rhetorical Analysis' },
    ...(overrides.classAssignment as object),
  },
});

/** Roster shape: prisma filters the relations down to this membership. */
const roster = ({ student = false, teacher = false } = {}) => ({
  id: 'class-1',
  students: student ? [{ id: 'member-1' }] : [],
  teachers: teacher ? [{ id: 'member-1' }] : [],
});

beforeEach(() => {
  prisma.class.findFirst.mockReset().mockResolvedValue(roster({ student: true }));
  requireUserId.mockReset().mockResolvedValue('user-1');
  requireMembership
    .mockReset()
    .mockResolvedValue({ id: 'member-1', role: 'STUDENT' });
  resolveShareLinkByToken.mockReset().mockResolvedValue(shareLink());
  recordShareLinkLaunch.mockReset().mockResolvedValue(undefined);
  redirectWithToast
    .mockReset()
    .mockImplementation((to: string) => new Response(null, {
      status: 302,
      headers: { location: to },
    }));
});

describe('classroom launch', () => {
  test('404s on an unknown or revoked token', async () => {
    resolveShareLinkByToken.mockResolvedValue(null);

    const response = await call().catch((thrown: unknown) => thrown);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(404);
  });

  test('404s on a missing token without hitting the database', async () => {
    const response = await loader({
      request: new Request(LAUNCH_URL),
      params: {},
      context: {},
    } as any).catch((thrown: unknown) => thrown);

    expect((response as Response).status).toBe(404);
    expect(resolveShareLinkByToken).not.toHaveBeenCalled();
  });

  test('sends a signed-out visitor to login and back to this link afterwards', async () => {
    // requireUserId throws a redirect carrying redirectTo; the launch route
    // must not swallow it, or students arrive logged out and stranded.
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { location: '/auth/login?redirectTo=%2Fclassroom%2Flaunch%2Ftok_123' },
    });
    requireUserId.mockRejectedValue(loginRedirect);

    const thrown = await call().catch((error: unknown) => error);

    expect(thrown).toBe(loginRedirect);
  });

  test('drops an enrolled student on their assignments list', async () => {
    prisma.class.findFirst.mockResolvedValue(roster({ student: true }));

    const response = (await call()) as Response;

    expect(response.status).toBe(302);
    // The class page, not the generic dashboard: `tab=assignments` only means
    // something on this route.
    expect(response.headers.get('location')).toBe(
      '/app/my-classes/class-1?tab=assignments'
    );
  });

  test('takes the class teacher to that assignment, not the student view', async () => {
    requireMembership.mockResolvedValue({ id: 'member-1', role: 'TEACHER' });
    prisma.class.findFirst.mockResolvedValue(roster({ teacher: true }));

    const response = (await call()) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      '/app/my-classes/class-1/assignments/a-1'
    );
  });

  test('tells an enrolled student when the assignment is not posted yet', async () => {
    resolveShareLinkByToken.mockResolvedValue(
      shareLink({
        classAssignment: { postAt: new Date(Date.now() + 86_400_000) },
      })
    );
    prisma.class.findFirst.mockResolvedValue(roster({ student: true }));

    await call();

    expect(redirectWithToast).toHaveBeenCalled();
    const [, toast] = redirectWithToast.mock.calls[0];
    expect(toast.description).toMatch(/not open yet/i);
  });

  test('explains itself to someone who is not on the roster, rather than 404ing', async () => {
    prisma.class.findFirst.mockResolvedValue(roster());

    const result = await call();

    // A rendered page, not a redirect: this is the common wrong-account case
    // and a bare error would leave the student with nothing to do.
    expect(result).toMatchObject({ status: 'not-enrolled' });
  });

  test('records the launch for an enrolled student', async () => {
    await call();

    expect(recordShareLinkLaunch).toHaveBeenCalledWith('link-1');
  });

  test('does not record a launch for someone who could not get in', async () => {
    prisma.class.findFirst.mockResolvedValue(roster());

    await call();

    expect(recordShareLinkLaunch).not.toHaveBeenCalled();
  });
});
