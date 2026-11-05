import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const getLessonPlannerAccess = mock();
const isFeatureFlagEnabled = mock();
const openYawpLesson = mock();

mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({
  getLessonPlannerAccess,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ isFeatureFlagEnabled }));
mock.module('~/domain/lesson-planner/yawp-lessons.server', () => ({ openYawpLesson }));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

const teacher = {
  userId: 'user-1',
  membership: { id: 'teacher-1', role: 'TEACHER', organization: { id: 'org-1' } },
  isTeacher: true,
  enabled: true,
  allowed: true,
};

function open(slug: string) {
  return loader({
    request: new Request(`http://localhost/app/lesson-planner/yawp/${slug}`),
    params: { slug },
    context: {},
  } as any);
}

/** What the loader threw: a redirect Response, or `data()`'s status and body. */
async function thrown(promise: Promise<unknown>): Promise<{ status: number; headers: Headers }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) return error;
    const thrownData = error as { init?: { status?: number } };
    return { status: thrownData.init?.status ?? 200, headers: new Headers() };
  }
  throw new Error('expected the loader to redirect or 404');
}

beforeEach(() => {
  getLessonPlannerAccess.mockReset().mockResolvedValue(teacher);
  isFeatureFlagEnabled.mockReset().mockResolvedValue(true);
  openYawpLesson.mockReset().mockResolvedValue({ conversationId: 'conv-1', created: true });
});

describe('/app/lesson-planner/yawp/:slug', () => {
  test('opens the teacher’s copy of the lesson on its stack page', async () => {
    const response = await thrown(open('pre-writing'));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app/lesson-planner/conv-1/packet');
    expect(openYawpLesson).toHaveBeenCalledTimes(1);
    const [scope, lesson] = openYawpLesson.mock.calls[0];
    expect(scope).toEqual({ membershipId: 'teacher-1', organizationId: 'org-1' });
    expect(lesson.slug).toBe('pre-writing');
    expect(isFeatureFlagEnabled).toHaveBeenCalledWith('assignment-type-lesson-plans', 'org-1');
  });

  test('with the flag off for the school, the route is not there', async () => {
    isFeatureFlagEnabled.mockResolvedValue(false);
    const response = await thrown(open('pre-writing'));
    expect(response.status).toBe(404);
    expect(openYawpLesson).not.toHaveBeenCalled();
  });

  test('without the Lesson Planner, there is nowhere to put the copy: back to the app', async () => {
    getLessonPlannerAccess.mockResolvedValue({ ...teacher, enabled: false, allowed: false });
    const response = await thrown(open('pre-writing'));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app');
    expect(openYawpLesson).not.toHaveBeenCalled();
  });

  test('a student gets the same redirect, not a copy', async () => {
    getLessonPlannerAccess.mockResolvedValue({
      ...teacher,
      membership: { ...teacher.membership, role: 'STUDENT' },
      isTeacher: false,
      allowed: false,
    });
    const response = await thrown(open('pre-writing'));
    expect(response.headers.get('location')).toBe('/app');
    expect(openYawpLesson).not.toHaveBeenCalled();
  });

  test('an unknown lesson is a 404', async () => {
    const response = await thrown(open('not-a-lesson'));
    expect(response.status).toBe(404);
    expect(openYawpLesson).not.toHaveBeenCalled();
  });
});
