import { beforeEach, describe, expect, mock, test } from 'bun:test';

const invitationValues = new Map<string, unknown>();
const invitationSession = {
  get: (key: string) => invitationValues.get(key),
};
const prisma = {
  school: { findFirst: mock(), findMany: mock() },
  orgMembership: { findFirst: mock(), create: mock(), update: mock() },
  user: { findUnique: mock() },
};
const requireUserId = mock();
const redirectWithToast = mock();
const setMembershipId = mock();
const clearSchoolYearScope = mock();

mock.module('~/utils/db.server.ts', () => ({ prisma }));
mock.module('~/utils/auth.server.ts', () => ({ requireUserId }));
mock.module('~/cookie-session-storages/invitation.server', () => ({
  invitationCookieStorage: {
    getSession: async () => invitationSession,
    destroySession: async () => 'invitation=; Max-Age=0',
  },
}));
mock.module('~/utils/toast.server.ts', () => ({ redirectWithToast }));
mock.module('~/cookies/membership-id.server', () => ({ setMembershipId }));
mock.module('~/cookies/school-year.server', () => ({ clearSchoolYearScope }));

const { action } = await import('./route');

function selectSchoolRequest(schoolId: string) {
  const form = new FormData();
  form.set('schoolId', schoolId);
  return new Request('https://yawp.school/auth/inv/onboard-teacher-school', {
    method: 'POST',
    body: form,
  });
}

describe('teacher invite school selection', () => {
  beforeEach(() => {
    invitationValues.clear();
    invitationValues.set('email', 'teacher@yawp.test');
    invitationValues.set('organizationId', 'org-ua');
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
    requireUserId.mockReset();
    redirectWithToast.mockReset();
    setMembershipId.mockReset();
    clearSchoolYearScope.mockReset();

    requireUserId.mockResolvedValue('user-1');
    prisma.user.findUnique.mockResolvedValue({ email: 'teacher@yawp.test' });
    prisma.school.findFirst.mockResolvedValue({ id: 'school-1' });
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    prisma.orgMembership.create.mockResolvedValue({ id: 'member-1' });
    setMembershipId.mockResolvedValue('membership=member-1');
    clearSchoolYearScope.mockResolvedValue('school-year=; Max-Age=0');
    redirectWithToast.mockImplementation(
      async (to: string, _toast: unknown, init?: ResponseInit) =>
        new Response(null, {
          ...init,
          status: 302,
          headers: { location: to, ...(init?.headers as HeadersInit) },
        })
    );
  });

  test('creates a teacher membership connected to the selected organization school', async () => {
    const response = (await action({
      request: selectSchoolRequest('school-1'),
    } as any)) as Response;

    expect(prisma.school.findFirst).toHaveBeenCalledWith({
      where: { id: 'school-1', organizationId: 'org-ua' },
      select: { id: true },
    });
    expect(prisma.orgMembership.create).toHaveBeenCalledWith({
      data: {
        user: { connect: { id: 'user-1' } },
        organization: { connect: { id: 'org-ua' } },
        role: 'TEACHER',
        schools: { connect: [{ id: 'school-1' }] },
      },
      select: { id: true },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app');
  });
});
