import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const findShareableClassAssignmentForTeacher = mock();
const getOrCreateShareLink = mock();

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/integrations/google-classroom/share-link.server', () => ({
  findShareableClassAssignmentForTeacher,
  getOrCreateShareLink,
}));

const { action, loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

const call = (classAssignmentId: string | null = 'ca-1') => {
  const body = new FormData();
  if (classAssignmentId !== null) {
    body.set('classAssignmentId', classAssignmentId);
  }
  return action({
    request: new Request('https://app.yawp.com/api/classroom/share', {
      method: 'POST',
      body,
    }),
    params: {},
    context: {},
  } as any);
};

const teacherMembership = (overrides: Record<string, unknown> = {}) => ({
  id: 'teacher-1',
  role: 'TEACHER',
  organization: { id: 'org-1', googleClassroomEnabled: true },
  ...overrides,
});

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('user-1');
  requireMembership.mockReset().mockResolvedValue(teacherMembership());
  findShareableClassAssignmentForTeacher.mockReset().mockResolvedValue({
    id: 'ca-1',
    dueAt: null,
    class: { id: 'class-1', title: 'AP Lang', period: '3', grade: '11' },
    assignment: {
      id: 'a-1',
      title: 'Rhetorical Analysis',
      prompt: 'Analyse the rhetoric of the passage.',
      pointValue: 100,
      assignmentType: { title: 'Essay' },
    },
  });
  getOrCreateShareLink.mockReset().mockResolvedValue({
    id: 'link-1',
    token: 'tok_123',
    classAssignmentId: 'ca-1',
    revokedAt: null,
  });
});

describe('classroom share endpoint', () => {
  test('redirects the teacher to Google with the launch URL attached', async () => {
    const response = (await call()) as Response;

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin + location.pathname).toBe(
      'https://classroom.google.com/share'
    );
    expect(location.searchParams.get('url')).toBe(
      'https://app.yawp.com/classroom/launch/tok_123'
    );
  });

  test('prefills the Classroom item with the assignment title', async () => {
    const response = (await call()) as Response;

    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('title')).toBe('Rhetorical Analysis');
    expect(location.searchParams.get('itemtype')).toBe('assignment');
  });

  test('falls back to the assignment type when the assignment is untitled', async () => {
    findShareableClassAssignmentForTeacher.mockResolvedValue({
      id: 'ca-1',
      dueAt: null,
      class: { id: 'class-1', title: 'AP Lang', period: '3', grade: '11' },
      assignment: {
        id: 'a-1',
        title: null,
        prompt: 'Analyse the rhetoric.',
        pointValue: 100,
        assignmentType: { title: 'Essay' },
      },
    });

    const response = (await call()) as Response;

    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('title')).toBe('Essay');
  });

  test('refuses when the organization does not have the integration turned on', async () => {
    requireMembership.mockResolvedValue(
      teacherMembership({
        organization: { id: 'org-1', googleClassroomEnabled: false },
      })
    );

    const response = (await call()) as Response;

    expect(response.status).toBe(404);
    expect(getOrCreateShareLink).not.toHaveBeenCalled();
  });

  test('refuses a student, who has no business posting to Classroom', async () => {
    requireMembership.mockResolvedValue(
      teacherMembership({ id: 'student-1', role: 'STUDENT' })
    );

    const response = (await call()) as Response;

    expect(response.status).toBe(403);
    expect(getOrCreateShareLink).not.toHaveBeenCalled();
  });

  test('refuses an assignment the teacher does not teach', async () => {
    findShareableClassAssignmentForTeacher.mockResolvedValue(null);

    const response = (await call()) as Response;

    expect(response.status).toBe(404);
    expect(getOrCreateShareLink).not.toHaveBeenCalled();
  });

  test('rejects a request with no assignment named', async () => {
    const response = (await call(null)) as Response;

    expect(response.status).toBe(400);
    expect(findShareableClassAssignmentForTeacher).not.toHaveBeenCalled();
  });

  test('mints against the requesting teacher, so the link records who shared it', async () => {
    await call();

    expect(getOrCreateShareLink).toHaveBeenCalledWith({
      classAssignmentId: 'ca-1',
      membershipId: 'teacher-1',
    });
  });

  test('a GET lands the teacher back in the app instead of erroring', async () => {
    const response = (await loader({
      request: new Request('https://app.yawp.com/api/classroom/share'),
      params: {},
      context: {},
    } as any)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app');
  });
});
