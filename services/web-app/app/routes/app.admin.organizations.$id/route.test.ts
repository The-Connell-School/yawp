import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  assignmentType: {
    findMany: mock(),
  },
  organizationFlag: {
    findUnique: mock(),
    upsert: mock(),
  },
  invitation: {
    findMany: mock(),
  },
  organization: {
    count: mock(),
    delete: mock(),
    findUnique: mock(),
    update: mock(),
  },
  organizationAssignmentType: {
    createMany: mock(),
    deleteMany: mock(),
  },
  user: {
    findUnique: mock(),
  },
};

const requireAdmin = mock();
const requireMembership = mock();
const requireUserId = mock();

const dbServerMock = () => ({ prisma });
const authServerMock = () => ({
  getSessionExpirationDate: () => new Date('2030-01-01T00:00:00.000Z'),
  requireAdmin,
  requireMembership,
  requireUserId,
  sessionKey: 'sessionId',
});

mock.module('~/utils/db.server', dbServerMock);
mock.module('~/utils/db.server.ts', dbServerMock);
mock.module('~/utils/db.server.js', dbServerMock);
mock.module('~/utils/auth.server', authServerMock);
mock.module('~/utils/auth.server.ts', authServerMock);
mock.module('~/utils/auth.server.js', authServerMock);
mock.module('~/utils/email.server', () => ({ sendEmail: mock() }));
mock.module('~/utils/totp.server', () => ({
  generateTOTP: mock(),
}));

const { action: routeAction, loader: routeLoader } = await import('./route');
const action = routeAction as any;
const loader = routeLoader as any;

afterAll(() => {
  mock.restore();
});

function organizationFixture() {
  return {
    id: 'org-1',
    name: 'Test Org',
    numOfStudentSeats: 30,
    numOfTeacherSeats: 10,
    accessExpiresAt: null,
    memberships: [],
    assignmentTypeAssignments: [],
  };
}

function updateRequest(form: URLSearchParams) {
  return new Request('https://example.test/app/admin/organizations/org-1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
}

describe('admin organization detail route', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.assignmentType.findMany.mockReset();
    prisma.organizationFlag.findUnique.mockReset();
    prisma.organizationFlag.upsert.mockReset();
    prisma.invitation.findMany.mockReset();
    prisma.organization.count.mockReset();
    prisma.organization.delete.mockReset();
    prisma.organization.findUnique.mockReset();
    prisma.organization.update.mockReset();
    prisma.organizationAssignmentType.createMany.mockReset();
    prisma.organizationAssignmentType.deleteMany.mockReset();
    prisma.user.findUnique.mockReset();
    requireAdmin.mockReset();
    requireMembership.mockReset();
    requireUserId.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireUserId.mockResolvedValue('admin-1');
    requireMembership.mockResolvedValue({
      organization: { id: 'admin-org' },
    });
    prisma.assignmentType.findMany.mockResolvedValue([]);
    prisma.organizationFlag.findUnique.mockResolvedValue(null);
    prisma.invitation.findMany.mockResolvedValue([]);
    prisma.organization.count.mockResolvedValue(2);
    prisma.organization.findUnique.mockResolvedValue(organizationFixture());
    prisma.organization.update.mockReturnValue({ operation: 'update-org' });
    prisma.organizationAssignmentType.deleteMany.mockReturnValue({
      operation: 'delete-org-assignment-types',
    });
    prisma.organizationFlag.upsert.mockReturnValue({
      operation: 'upsert-writing-practice-organization-flag',
    });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: true });
    prisma.$transaction.mockResolvedValue([]);
  });

  test('loads writing practice as disabled when the organization has no organization flag row', async () => {
    const response = await loader({
      request: new Request('https://example.test/app/admin/organizations/org-1'),
      params: { id: 'org-1' },
      context: {} as never,
    });

    expect(response.data.writingPracticeEnabled).toBe(false);
    expect(prisma.organizationFlag.findUnique).toHaveBeenCalledWith({
      where: {
        key_organizationId: {
          key: 'writing_practice',
          organizationId: 'org-1',
        },
      },
      select: { enabled: true },
    });
  });

  test('loads writing practice as enabled from the organization flag row', async () => {
    prisma.organizationFlag.findUnique.mockResolvedValue({ enabled: true });

    const response = await loader({
      request: new Request('https://example.test/app/admin/organizations/org-1'),
      params: { id: 'org-1' },
      context: {} as never,
    });

    expect(response.data.writingPracticeEnabled).toBe(true);
  });

  test('updates the writing practice organization flag from the edit sheet', async () => {
    const form = new URLSearchParams();
    form.set('intent', 'update');
    form.set('name', 'Test Org');
    form.set('numOfStudentSeats', '30');
    form.set('numOfTeacherSeats', '10');
    form.set('writingPracticeEnabled', 'true');

    await action({
      request: updateRequest(form),
      params: { id: 'org-1' },
      context: {} as never,
    });

    expect(prisma.organizationFlag.upsert).toHaveBeenCalledWith({
      where: {
        key_organizationId: {
          key: 'writing_practice',
          organizationId: 'org-1',
        },
      },
      update: {
        enabled: true,
        description: 'Enable writing practice lessons for this organization.',
      },
      create: {
        key: 'writing_practice',
        organizationId: 'org-1',
        enabled: true,
        description: 'Enable writing practice lessons for this organization.',
      },
    });
  });

  test('keeps writing practice disabled when the edit sheet checkbox is unchecked', async () => {
    const form = new URLSearchParams();
    form.set('intent', 'update');
    form.set('name', 'Test Org');
    form.set('numOfStudentSeats', '30');
    form.set('numOfTeacherSeats', '10');

    await action({
      request: updateRequest(form),
      params: { id: 'org-1' },
      context: {} as never,
    });

    expect(prisma.organizationFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ enabled: false }),
        create: expect.objectContaining({ enabled: false }),
      })
    );
  });
});
