import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();

let lessonPlannerMeteringEnabled = false;
mock.module('~/domain/free-tier/monthly-policy.server', () => ({
  monthlyFreeTierPolicy: async () => ({
    enabled: lessonPlannerMeteringEnabled,
    lessonPlannerMeteringEnabled,
  }),
}));

// The flag is read from its real Setting row, so this suite never replaces
// the feature-flag module for the suites that share its process.
const findUnique = mock();
const findMany = mock();
const flagValue = (value: string | null) => {
  const freeTierRow = { name: 'feature_flag.free_tier', value: '{"mode":"everyone","orgIds":[]}' };
  findMany.mockImplementation(({ where }: { where: { name: { in: string[] } } }) =>
    Promise.resolve(
      where.name.in.includes('feature_flag.free_tier') ? [freeTierRow] : []
    )
  );
  findUnique.mockImplementation(({ where }: { where: { name: string } }) => {
    const resolved = value === null ? null : { value };
    if (where.name === 'feature_flag.free_tier') {
      return Promise.resolve(resolved ?? { value: freeTierRow.value });
    }
    return Promise.resolve(resolved);
  });
};

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
  requireMutableRequest: mock(),
}));
mock.module('~/utils/db.server', () => ({
  prisma: { setting: { findUnique, findMany } },
}));

const { getLessonPlannerAccess, requireLessonPlannerAccess } =
  await import('./lesson-planner-access.server');

afterAll(() => {
  mock.restore();
});

function membership(
  role: 'TEACHER' | 'STUDENT',
  organizationId = 'org-1',
  plan: 'SCHOOL' | 'FREE_CLASSROOM' = 'SCHOOL'
) {
  return {
    id: 'member-1',
    role,
    organization: { id: organizationId, name: 'Org', plan },
  };
}

const request = new Request('https://example.test/app/lesson-planner');

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('user-1');
  requireMembership.mockReset().mockResolvedValue(membership('TEACHER'));
  findUnique.mockReset();
  findMany.mockReset();
  flagValue('true');
  lessonPlannerMeteringEnabled = false;
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

  test("follows the flag's targeting for the viewer's school", async () => {
    flagValue('{"mode":"targeted","orgIds":["org-1"]}');
    expect(await getLessonPlannerAccess(request)).toMatchObject({
      enabled: true,
      allowed: true,
    });
    requireMembership.mockResolvedValue(membership('TEACHER', 'org-2'));
    expect(await getLessonPlannerAccess(request)).toMatchObject({
      enabled: false,
      allowed: false,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { name: 'feature_flag.lesson_planner' },
      select: { value: true },
    });
  });

  test('denies teachers when the Lesson Planner flag is off', async () => {
    flagValue('false');
    const access = await getLessonPlannerAccess(request);
    expect(access).toMatchObject({ isTeacher: true, enabled: false, allowed: false });
    const thrown = await requireLessonPlannerAccess(request).catch(
      (error: unknown) => error
    );
    expect((thrown as { init: { status: number } }).init.status).toBe(404);
  });

  test('denies FREE_CLASSROOM teachers when only monthly Lesson Planner metering is on', async () => {
    flagValue('false');
    lessonPlannerMeteringEnabled = true;
    requireMembership.mockResolvedValue(
      membership('TEACHER', 'org-free', 'FREE_CLASSROOM')
    );
    const access = await getLessonPlannerAccess(request);
    expect(access).toMatchObject({
      isTeacher: true,
      enabled: false,
      allowed: false,
    });
  });
});
