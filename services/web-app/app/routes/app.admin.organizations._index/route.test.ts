import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  organization: {
    create: mock(),
  },
};

const requireAdmin = mock();
const requireUserId = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  getSessionExpirationDate: () => new Date('2030-01-01T00:00:00.000Z'),
  requireAdmin,
  requireUserId,
  sessionKey: 'sessionId',
}));
mock.module('~/utils/cookies.server', () => ({
  getOrganizationTableCookie: mock(),
  getOrganizationTableCookieValue: mock(),
  OrganizationTableCookie: {},
  setOrganizationTableCookie: mock(),
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

function createRequest(form: URLSearchParams) {
  return new Request('https://example.test/app/admin/organizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
}

describe('admin organizations index route', () => {
  beforeEach(() => {
    prisma.organization.create.mockReset();
    requireAdmin.mockReset();
    requireUserId.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireUserId.mockResolvedValue('admin-1');
    prisma.organization.create.mockResolvedValue({ id: 'org-1' });
  });

  test('creates each organization with default organization flags', async () => {
    const form = new URLSearchParams();
    form.set('intent', 'create');
    form.set('name', 'New Org');
    form.set('numOfStudentSeats', '30');
    form.set('numOfTeacherSeats', '10');

    await action({
      request: createRequest(form),
      params: {},
      context: {} as never,
    } as any);

    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: {
        name: 'New Org',
        numOfStudentSeats: 30,
        numOfTeacherSeats: 10,
        accessExpiresAt: null,
        organizationFlags: {
          create: {
            key: 'writing_practice',
            enabled: false,
            description: 'Enable writing practice lessons for this organization.',
          },
        },
      },
    });
  });
});
