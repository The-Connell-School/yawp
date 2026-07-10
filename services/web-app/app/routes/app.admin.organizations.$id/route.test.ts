import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  assignmentType: {
    findMany: mock(),
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
    prisma.invitation.findMany.mockResolvedValue([]);
    prisma.organization.count.mockResolvedValue(2);
    prisma.organization.findUnique.mockResolvedValue(organizationFixture());
    prisma.organization.update.mockReturnValue({ operation: 'update-org' });
    prisma.organizationAssignmentType.deleteMany.mockReturnValue({
      operation: 'delete-org-assignment-types',
    });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: true });
    prisma.$transaction.mockResolvedValue([]);
  });

  test('does not load writing practice state for the organization edit sheet', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/admin/organizations/org-1'
      ),
      params: { id: 'org-1' },
      context: {} as never,
    });

    expect(response.data).not.toHaveProperty(
      ['writingPractice', 'Enabled'].join('')
    );
  });

  test('updates organization assignment types without writing practice state', async () => {
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

    const transactionOps = prisma.$transaction.mock.calls[0]?.[0] ?? [];
    expect(transactionOps).toEqual([
      { operation: 'update-org' },
      { operation: 'delete-org-assignment-types' },
    ]);
  });

  test('enables Yawp Reporter when the toggle is checked', async () => {
    const form = new URLSearchParams();
    form.set('intent', 'update');
    form.set('name', 'Test Org');
    form.set('numOfStudentSeats', '30');
    form.set('numOfTeacherSeats', '10');
    form.set('reporterEnabled', 'true');

    await action({
      request: updateRequest(form),
      params: { id: 'org-1' },
      context: {} as never,
    });

    const updateArg = prisma.organization.update.mock.calls[0][0];
    expect(updateArg.data.reporterEnabled).toBe(true);
  });

  test('disables Yawp Reporter when the toggle is absent', async () => {
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

    const updateArg = prisma.organization.update.mock.calls[0][0];
    expect(updateArg.data.reporterEnabled).toBe(false);
  });
});
