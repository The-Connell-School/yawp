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
  submissionActivity: {
    count: mock(),
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
    revisionFlowEnabled: false,
    accessExpiresAt: null,
    memberships: [],
    assignmentTypeAssignments: [],
  };
}

function updateRequest(form: URLSearchParams) {
  if (form.get('intent') === 'update') form.set('intent', 'legacy-update');
  return new Request('https://example.test/app/admin/organizations/org-1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
}

function rawUpdateRequest(form: URLSearchParams) {
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

  test('keeps organization hard deletion compatible with database cascades', async () => {
    const form = new URLSearchParams();
    form.set('intent', 'deleteOrganization');

    await action({
      request: updateRequest(form),
      params: { id: 'org-1' },
      context: {} as never,
    });

    expect(prisma.organization.delete).toHaveBeenCalledWith({
      where: { id: 'org-1' },
    });
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

  test('marks platform organization updates as moved to Internal', async () => {
    const form = new URLSearchParams({ intent: 'update', name: 'Moved Org' });

    const response = await action({
      request: rawUpdateRequest(form),
      params: { id: 'org-1' },
      context: {} as never,
    });

    expect(response).toMatchObject({
      init: { status: 410 },
      data: {
        status: 'error',
        error: 'Organization updates have moved to Yawp Internal.',
      },
    });
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  test('blocks hidden legacy organization update submissions', async () => {
    const form = new URLSearchParams();
    form.set('intent', 'legacy-update');
    form.set('name', 'Test Org');
    form.set('numOfStudentSeats', '30');
    form.set('numOfTeacherSeats', '10');

    const response = await action({
      request: rawUpdateRequest(form),
      params: { id: 'org-1' },
      context: {} as never,
    });

    expect(response).toMatchObject({
      init: { status: 410 },
      data: {
        status: 'error',
        error: 'Organization updates have moved to Yawp Internal.',
      },
    });
    expect(prisma.organization.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
