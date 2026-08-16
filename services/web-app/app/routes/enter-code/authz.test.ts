/**
 * N4 -- `/enter-code` self-enrollment into any class.
 *
 * The route's two intents are meant to run in sequence: `validate-code` proves the
 * caller knows a class code, and `assign-class` picks among the matches when a code is
 * ambiguous. `assign-class` was independently reachable and re-derived nothing, so any
 * authenticated user could enroll themselves in any class, in any organization.
 *
 * Class codes are unique per *school* (`@@unique([schoolId, code])`), not globally, so
 * two schools legitimately share a code and the ambiguous-selection flow has to keep
 * working. The fixtures below encode both cases at once: MATH101 is shared by two
 * schools inside the caller's own organization (legitimate ambiguity) and SHARED
 * collides across two organizations (cross-tenant, must not be offered).
 *
 * Both `where` clauses run through `matchesClassWhere` rather than being asserted on
 * their shape, so these tests fail against the pre-fix route.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { matchesClassWhere, type ScopedClass } from '~/utils/testing/where-eval';

const prisma = {
  class: { findMany: mock(), findFirst: mock() },
  orgMembership: { update: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const redirectWithToast = mock();
const getStudentPreviewState = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));

const { action, loader } = await import('./route');

const CLASSES: ScopedClass[] = [
  // Same code, two schools, one organization: the legitimate ambiguous flow.
  { id: 'class-a1', code: 'MATH101', isArchived: false, organizationId: 'org-a' },
  { id: 'class-a2', code: 'MATH101', isArchived: false, organizationId: 'org-a' },
  // Same code in two different organizations: the cross-tenant collision.
  { id: 'class-a3', code: 'SHARED', isArchived: false, organizationId: 'org-a' },
  { id: 'class-b1', code: 'SHARED', isArchived: false, organizationId: 'org-b' },
  // The class an attacker in another organization wants in on.
  { id: 'class-a4', code: 'SECRET', isArchived: false, organizationId: 'org-a' },
];

function classRow(klass: ScopedClass) {
  return {
    id: klass.id,
    code: klass.code,
    schoolYear: '2024-2025',
    period: null,
    grade: null,
    school: { name: `school-${klass.organizationId}` },
    teachers: [{ user: { name: 'Teacher' } }],
  };
}

function actingAs(membershipId: string, organizationId: string) {
  requireUserId.mockResolvedValue(`user-${membershipId}`);
  requireMembership.mockResolvedValue({
    id: membershipId,
    role: 'STUDENT' as const,
    isOrgOwner: false,
    organization: {
      id: organizationId,
      name: organizationId,
      reporterEnabled: false,
      classInsightsEnabled: false,
      writingPracticeEnabled: false,
    },
  });
}

function post(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request('https://example.com/enter-code', {
    method: 'POST',
    body: form,
  });
}

describe('enter-code authorization', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset();
    prisma.class.findFirst.mockReset();
    prisma.orgMembership.update.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    redirectWithToast.mockReset();
    getStudentPreviewState.mockReset();

    getStudentPreviewState.mockResolvedValue({ active: false });
    redirectWithToast.mockImplementation(
      async (to: string) =>
        new Response(null, { status: 302, headers: { location: to } })
    );
    // Stands in for the database: rows come back only when the query's own where
    // clause selects them.
    prisma.class.findMany.mockImplementation(async ({ where }: any) =>
      CLASSES.filter((klass) => matchesClassWhere(where, klass)).map(classRow)
    );
    prisma.class.findFirst.mockImplementation(async ({ where }: any) => {
      const match = CLASSES.find((klass) => matchesClassWhere(where, klass));
      return match ? classRow(match) : null;
    });
    prisma.orgMembership.update.mockResolvedValue({});
  });

  test('assign-class without a code cannot enroll the caller in a class', async () => {
    actingAs('membership-b', 'org-b');

    await action({
      request: post({ intent: 'assign-class', classId: 'class-a4' }),
      params: {},
      context: {} as any,
    } as any);

    expect(prisma.orgMembership.update).not.toHaveBeenCalled();
  });

  test('assign-class with the wrong code cannot enroll the caller in a class', async () => {
    actingAs('membership-a', 'org-a');

    await action({
      request: post({
        intent: 'assign-class',
        classId: 'class-a4',
        code: 'MATH101',
      }),
      params: {},
      context: {} as any,
    } as any);

    expect(prisma.orgMembership.update).not.toHaveBeenCalled();
  });

  test('assign-class cannot reach a class in another organization even with its real code', async () => {
    actingAs('membership-b', 'org-b');

    await action({
      request: post({
        intent: 'assign-class',
        classId: 'class-a4',
        code: 'SECRET',
      }),
      params: {},
      context: {} as any,
    } as any);

    expect(prisma.orgMembership.update).not.toHaveBeenCalled();
  });

  test('the ambiguous two-step flow still enrolls the student', async () => {
    actingAs('membership-a', 'org-a');

    // Step one: an ambiguous code inside the caller's organization sends them to the
    // selection screen rather than enrolling them.
    const first = (await action({
      request: post({ intent: 'validate-code', code: 'MATH101' }),
      params: {},
      context: {} as any,
    } as any)) as Response;

    expect(first.status).toBe(302);
    expect(first.headers.get('location')).toContain('code=MATH101');
    expect(prisma.orgMembership.update).not.toHaveBeenCalled();

    // The selection screen lists both same-code classes in the caller's organization.
    const loaded = (await loader({
      request: new Request('https://example.com/enter-code?code=MATH101'),
      params: {},
      context: {} as any,
    } as any)) as any;
    const listed = (loaded.data ?? loaded).classes.map((k: any) => k.id);
    expect(listed).toEqual(['class-a1', 'class-a2']);

    // Step two: picking one of them, with the code carried through, enrolls.
    const second = (await action({
      request: post({
        intent: 'assign-class',
        classId: 'class-a2',
        code: 'MATH101',
      }),
      params: {},
      context: {} as any,
    } as any)) as Response;

    expect(second.status).toBe(302);
    expect(prisma.orgMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'membership-a' },
        data: { classesAsStudent: { connect: { id: 'class-a2' } } },
      })
    );
  });

  test('a code colliding across organizations resolves inside the caller organization only', async () => {
    actingAs('membership-a', 'org-a');

    const response = (await action({
      request: post({ intent: 'validate-code', code: 'SHARED' }),
      params: {},
      context: {} as any,
    } as any)) as Response;

    // Only org-a's class matches, so this is unambiguous and enrolls directly --
    // and never into org-b's same-code class.
    expect(response.status).toBe(302);
    expect(prisma.orgMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { classesAsStudent: { connect: { id: 'class-a3' } } },
      })
    );
  });

  test('the loader never lists another organization same-code class', async () => {
    actingAs('membership-a', 'org-a');

    const loaded = (await loader({
      request: new Request('https://example.com/enter-code?code=SHARED'),
      params: {},
      context: {} as any,
    } as any)) as any;

    const listed = (loaded.data ?? loaded).classes.map((k: any) => k.id);
    expect(listed).toEqual(['class-a3']);
  });
});
