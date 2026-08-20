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
    reporterEnabled: false,
    classInsightsEnabled: false,
    writingPracticeEnabled: false,
    submissionActivityEnabled: false,
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
      request: new Request('https://example.test/app/admin/organizations/org-1'),
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

  test('updates Reporter and Class Summary rollout gates independently', async () => {
    const form = new URLSearchParams();
    form.set('intent', 'update');
    form.set('name', 'Test Org');
    form.set('numOfStudentSeats', '30');
    form.set('numOfTeacherSeats', '10');
    form.set('reporterEnabled', 'true');
    form.set('classInsightsEnabled', 'true');

    await action({
      request: updateRequest(form),
      params: { id: 'org-1' },
      context: {} as never,
    });

    expect(prisma.organization.update.mock.calls[0][0].data).toMatchObject({
      reporterEnabled: true,
      classInsightsEnabled: true,
    });
  });

  test('disables both rollout gates when their toggles are absent', async () => {
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

    expect(prisma.organization.update.mock.calls[0][0].data).toMatchObject({
      reporterEnabled: false,
      classInsightsEnabled: false,
    });
  });

  test('updates the Writing Practice rollout gate for the organization', async () => {
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

    expect(prisma.organization.update.mock.calls[0][0].data).toMatchObject({
      writingPracticeEnabled: true,
    });
  });

  test('disables the Writing Practice rollout gate when its toggle is absent', async () => {
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

    expect(prisma.organization.update.mock.calls[0][0].data).toMatchObject({
      writingPracticeEnabled: false,
    });
  });

  test('updates the released grade activity rollout gate independently', async () => {
    const form = new URLSearchParams();
    form.set('intent', 'update');
    form.set('name', 'Test Org');
    form.set('numOfStudentSeats', '30');
    form.set('numOfTeacherSeats', '10');
    form.set('submissionActivityEnabled', 'true');

    await action({
      request: updateRequest(form),
      params: { id: 'org-1' },
      context: {} as never,
    });

    expect(prisma.organization.update.mock.calls[0][0].data).toMatchObject({
      submissionActivityEnabled: true,
      reporterEnabled: false,
      classInsightsEnabled: false,
      writingPracticeEnabled: false,
    });
  });
});
