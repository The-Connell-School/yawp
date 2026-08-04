import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const prisma = { organization: { findUnique: mock() } };

// The whole surface other modules import from auth.server: bun's module mocks
// are process-wide, so a partial mock here would break a sibling test file that
// loads a route needing one of the other exports.
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
  requireMutableRequest: mock(),
}));
mock.module('~/utils/db.server', () => ({ prisma }));

const { getLessonPlannerAccess, requireLessonPlannerAccess } =
  await import('./lesson-planner-access.server');

afterAll(() => {
  mock.restore();
});

function membership(role: 'TEACHER' | 'STUDENT') {
  return { id: 'member-1', role, organization: { id: 'org-1', name: 'Org' } };
}

const request = new Request('https://example.test/app/lesson-planner');

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('user-1');
  requireMembership.mockReset().mockResolvedValue(membership('TEACHER'));
  prisma.organization.findUnique
    .mockReset()
    .mockResolvedValue({ lessonPlannerEnabled: true });
});

describe('getLessonPlannerAccess', () => {
  test('allows a teacher in an enabled organization', async () => {
    const access = await getLessonPlannerAccess(request);
    expect(access).toMatchObject({
      isTeacher: true,
      enabled: true,
      allowed: true,
    });
  });

  test('denies a teacher whose organization has not been switched on', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      lessonPlannerEnabled: false,
    });
    const access = await getLessonPlannerAccess(request);
    expect(access).toMatchObject({ isTeacher: true, allowed: false });
  });

  test('denies non-teachers even when the organization is enabled', async () => {
    requireMembership.mockResolvedValue(membership('STUDENT'));
    const access = await getLessonPlannerAccess(request);
    expect(access).toMatchObject({ isTeacher: false, allowed: false });
  });

  test('treats a missing organization row as disabled', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    const access = await getLessonPlannerAccess(request);
    expect(access.allowed).toBe(false);
  });
});

describe('requireLessonPlannerAccess', () => {
  test('returns the access record when allowed', async () => {
    await expect(requireLessonPlannerAccess(request)).resolves.toMatchObject({
      allowed: true,
    });
  });

  test('throws a 404 so the feature stays invisible when not allowed', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      lessonPlannerEnabled: false,
    });
    const thrown = await requireLessonPlannerAccess(request).catch(
      (error: unknown) => error
    );
    expect((thrown as { init: { status: number } }).init.status).toBe(404);
  });
});
