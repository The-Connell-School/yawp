import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();

const isLessonPlannerEnabled = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
  requireMutableRequest: mock(),
}));
mock.module('~/utils/db.server', () => ({ prisma: {} }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isLessonPlannerEnabled,
}));

const { getLessonPlannerAccess, requireLessonPlannerAccess } =
  await import('./lesson-planner-access.server');

afterAll(() => {
  mock.restore();
});

function membership(role: 'TEACHER' | 'STUDENT') {
  return {
    id: 'member-1',
    role,
    organization: { id: 'org-1', name: 'Org', plan: 'SCHOOL' },
  };
}

const request = new Request('https://example.test/app/lesson-planner');

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('user-1');
  requireMembership.mockReset().mockResolvedValue(membership('TEACHER'));
  isLessonPlannerEnabled.mockReset().mockResolvedValue(true);
});

describe('getLessonPlannerAccess', () => {
  test('allows teachers', async () => {
    const access = await getLessonPlannerAccess(request);
    expect(access).toMatchObject({
      isTeacher: true,
      allowed: true,
    });
  });

  test('denies students with 404 on require', async () => {
    requireMembership.mockResolvedValue(membership('STUDENT'));
    const access = await getLessonPlannerAccess(request);
    expect(access).toMatchObject({ isTeacher: false, allowed: false });
    const thrown = await requireLessonPlannerAccess(request).catch(
      (error: unknown) => error
    );
    expect((thrown as { init: { status: number } }).init.status).toBe(404);
  });
});

describe('requireLessonPlannerAccess', () => {
  test('returns the access record when allowed', async () => {
    await expect(requireLessonPlannerAccess(request)).resolves.toMatchObject({
      allowed: true,
    });
  });

  test('denies teachers when the Lesson Planner flag is off', async () => {
    isLessonPlannerEnabled.mockResolvedValue(false);
    const access = await getLessonPlannerAccess(request);
    expect(access).toMatchObject({ isTeacher: true, enabled: false, allowed: false });
    const thrown = await requireLessonPlannerAccess(request).catch(
      (error: unknown) => error
    );
    expect((thrown as { init: { status: number } }).init.status).toBe(404);
  });
});
