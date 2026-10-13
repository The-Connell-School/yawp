import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  organization: {
    create: mock(),
    update: mock(),
    findMany: mock(),
    findUnique: mock(),
    count: mock(),
    groupBy: mock(),
  },
  organizationAssignmentType: {
    deleteMany: mock(),
    createMany: mock(),
  },
  assignmentType: {
    findMany: mock(),
  },
  invitation: {
    findMany: mock(),
  },
  internalPlatformApiAudit: {
    create: mock(),
    createMany: mock(),
    findFirst: mock(),
  },
  $transaction: mock(),
  $queryRaw: mock(),
  internalApiRequestNonce: {
    deleteMany: mock(),
    create: mock(),
  },
};

const isIsolatedPreviewSeatMode = mock();
const getConfiguredPreviewOrganizationAccessCode = mock();
const authorizeInternalApiRequest = mock();

mock.module('./db.server', () => ({ prisma }));
mock.module('./db.server.ts', () => ({ prisma }));
mock.module('./db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.ts', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('/home/bryant/work/yawp/codex-loop/worktrees/admin-migrate-2-platform/services/web-app/app/utils/db.server.ts', () => ({ prisma }));
mock.module('./internal-platform-auth.server', () => ({ authorizeInternalApiRequest }));
mock.module('./internal-platform-auth.server.ts', () => ({ authorizeInternalApiRequest }));
mock.module('./internal-platform-auth.server.js', () => ({ authorizeInternalApiRequest }));
mock.module('/home/bryant/work/yawp/codex-loop/worktrees/admin-migrate-2-platform/services/web-app/app/utils/internal-platform-auth.server.ts', () => ({ authorizeInternalApiRequest }));
mock.module('~/utils/preview-access.server', () => ({
  isIsolatedPreviewSeatMode,
  getConfiguredPreviewOrganizationAccessCode,
}));
mock.module('~/utils/preview-access.server.ts', () => ({
  isIsolatedPreviewSeatMode,
  getConfiguredPreviewOrganizationAccessCode,
}));
mock.module('/home/bryant/work/yawp/codex-loop/worktrees/admin-migrate-2-platform/services/web-app/app/utils/preview-access.server.ts', () => ({
  isIsolatedPreviewSeatMode,
  getConfiguredPreviewOrganizationAccessCode,
}));

const {
  internalAdminOrganizationCreate,
  internalAdminOrganizationDetail,
  internalAdminOrganizationUpdate,
  internalAdminOrganizationsList,
} = await import('./internal-admin-organizations.server');

const base = 'https://yawp.test/api/internal/v1/admin/organizations';

function authed(url = base) {
  return new Request(url);
}

describe('internal admin organization endpoints', () => {
  beforeEach(() => {
    authorizeInternalApiRequest.mockReset().mockResolvedValue({
      mode: 'legacy',
      keyId: 'legacy',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:read'],
    });
    prisma.organization.create.mockReset();
    prisma.organization.update.mockReset();
    prisma.organization.findMany.mockReset().mockResolvedValue([]);
    prisma.organization.findUnique.mockReset().mockResolvedValue(null);
    prisma.organization.count.mockReset().mockResolvedValue(0);
    prisma.organization.groupBy.mockReset().mockResolvedValue([]);
    prisma.organizationAssignmentType.deleteMany.mockReset();
    prisma.organizationAssignmentType.createMany.mockReset();
    prisma.assignmentType.findMany.mockReset().mockResolvedValue([]);
    prisma.invitation.findMany.mockReset().mockResolvedValue([]);
    prisma.internalPlatformApiAudit.create.mockReset();
    prisma.internalPlatformApiAudit.createMany.mockReset();
    prisma.internalPlatformApiAudit.findFirst.mockReset().mockResolvedValue(null);
    prisma.$transaction.mockReset().mockImplementation(async (fn: any) => fn(prisma));
    prisma.$queryRaw.mockReset().mockResolvedValue([{
      total_organizations: 0,
      active_organizations: 0,
      total_students: 0,
      total_teachers: 0,
    }]);
    isIsolatedPreviewSeatMode.mockReset().mockReturnValue(false);
    getConfiguredPreviewOrganizationAccessCode.mockReset().mockReturnValue(null);
  });

  test('rejects unauthorized list requests before reading organizations', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await internalAdminOrganizationsList(new Request(base));

    expect(res.status).toBe(401);
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
  });

  test('rejects unauthorized detail requests before reading organizations', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await internalAdminOrganizationDetail(new Request(`${base}/org-1`), 'org-1');

    expect(res.status).toBe(401);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  test('validates bounded pagination and sort inputs', async () => {
    expect((await internalAdminOrganizationsList(authed(`${base}?pageSize=101`))).status).toBe(400);
    expect((await internalAdminOrganizationsList(authed(`${base}?sort=bogus`))).status).toBe(400);

    const res = await internalAdminOrganizationsList(authed(`${base}?page=2&pageSize=10&sort=name&direction=asc&q=demo`));
    expect(res.status).toBe(200);
    expect(prisma.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      where: { name: { contains: 'demo', mode: 'insensitive' } },
      orderBy: { name: 'asc' },
    }));
  });

  test('returns preview codes only when preview seats are supported', async () => {
    prisma.organization.findMany.mockResolvedValue([{
      id: 'org-1',
      name: 'Demo Org',
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      numOfStudentSeats: 30,
      numOfTeacherSeats: 5,
      previewSeatCode: 'secret-preview-code',
      reporterEnabled: true,
      memberships: [{ role: 'STUDENT', isActive: true }],
    }]);

    let body = await (await internalAdminOrganizationsList(authed())).json();
    expect(body.previewSeatMode).toBe(false);
    expect(body.organizations[0].previewAccessCode).toBeNull();

    isIsolatedPreviewSeatMode.mockReturnValue(true);
    body = await (await internalAdminOrganizationsList(authed())).json();
    expect(body.previewSeatMode).toBe(true);
    expect(body.organizations[0].previewAccessCode).toBe('secret-preview-code');
  });

  test('returns organization detail with owners, assignment availability, and delete eligibility', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Demo Org',
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      numOfStudentSeats: 30,
      numOfTeacherSeats: 5,
      previewSeatCode: null,
      reporterEnabled: true,
      classInsightsEnabled: false,
      writingPracticeEnabled: false,
      submissionActivityEnabled: false,
      revisionFlowEnabled: false,
      apHistoryEnabled: false,
      collaborativeDraftsEnabled: false,
      studentDocumentSharingEnabled: false,
      memberships: [{
        id: 'm-1',
        role: 'TEACHER',
        isOrgOwner: true,
        isActive: true,
        user: { id: 'u-1', name: 'Owner', email: 'owner@yawp.test' },
      }],
      assignmentTypeAssignments: [{ assignmentTypeId: 'type-1' }],
    });
    prisma.organization.count.mockResolvedValue(1);
    prisma.assignmentType.findMany.mockResolvedValue([
      { id: 'type-1', title: 'Essay', description: null },
      { id: 'type-2', title: 'DBQ', description: null },
    ]);
    prisma.invitation.findMany.mockResolvedValue([
      { id: 'inv-1', createdAt: new Date('2026-10-02T00:00:00Z'), target: 'pending@yawp.test', expiresAt: null },
    ]);

    const res = await internalAdminOrganizationDetail(authed(`${base}/org-1`), 'org-1');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.organization.owners).toHaveLength(1);
    expect(body.organization.pendingOwnerInvitations[0].target).toBe('pending@yawp.test');
    expect(body.organization.assignmentTypes.map((t: { available: boolean }) => t.available)).toEqual([true, false]);
    expect(body.organization.deleteEligibility).toEqual({
      canDelete: false,
      reasons: ['Only organization in this environment'],
    });
    expect(body.organization.previewSeatCode).toBeUndefined();
  });

  test('creates organizations with signed write auth and before/after audit', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce({
      mode: 'hmac',
      keyId: 'writer',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:write'],
    });
    prisma.assignmentType.findMany.mockResolvedValue([{ id: 'type-1' }]);
    prisma.organization.create.mockResolvedValue({ id: 'org-1' });
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'New Org',
      numOfStudentSeats: 30,
      numOfTeacherSeats: 10,
      accessExpiresAt: null,
      reporterEnabled: false,
      assignmentTypeAssignments: [{ assignmentTypeId: 'type-1' }],
    });
    const body = JSON.stringify({
      name: 'New Org',
      numOfStudentSeats: 30,
      numOfTeacherSeats: 10,
      accessExpiresAt: null,
      featureToggles: { reporterEnabled: false },
      assignmentTypeIds: ['type-1'],
    });

    const res = await internalAdminOrganizationCreate(new Request(base, { method: 'POST', headers: { 'Idempotency-Key': 'create-1' }, body }));

    expect(res.status).toBe(201);
    expect(authorizeInternalApiRequest).toHaveBeenCalledWith(expect.any(Request), {
      body,
      requiredScope: 'management:write',
    });
    expect(prisma.organizationAssignmentType.createMany).toHaveBeenCalledWith({
      data: [{ organizationId: 'org-1', assignmentTypeId: 'type-1' }],
      skipDuplicates: true,
    });
    expect(prisma.internalPlatformApiAudit.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ action: 'organization.create.before', result: 'before' }),
          expect.objectContaining({ action: 'organization.create.after', result: 'after' }),
        ]),
      })
    );
  });

  test('replays idempotent organization create without creating a duplicate', async () => {
    prisma.internalPlatformApiAudit.findFirst.mockResolvedValue({
      targetId: 'org-existing',
      createdAt: new Date(),
    });
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-existing',
      name: 'Existing Org',
      numOfStudentSeats: 30,
      numOfTeacherSeats: 10,
      accessExpiresAt: null,
      reporterEnabled: false,
      assignmentTypeAssignments: [],
    });
    const body = JSON.stringify({
      name: 'Existing Org',
      numOfStudentSeats: 30,
      numOfTeacherSeats: 10,
    });

    const res = await internalAdminOrganizationCreate(new Request(base, { method: 'POST', headers: { 'Idempotency-Key': 'create-1' }, body }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.organization.id).toBe('org-existing');
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  test('updates organization fields and replaces only its assignment-type rows', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce({
      mode: 'hmac',
      keyId: 'writer',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:write'],
    });
    prisma.assignmentType.findMany.mockResolvedValue([{ id: 'type-2' }]);
    prisma.organization.findUnique
      .mockResolvedValueOnce({
        id: 'org-1',
        name: 'Old Org',
        numOfStudentSeats: 20,
        numOfTeacherSeats: 5,
        accessExpiresAt: null,
        reporterEnabled: false,
        assignmentTypeAssignments: [{ assignmentTypeId: 'type-1' }],
      })
      .mockResolvedValueOnce({
        id: 'org-1',
        name: 'Updated Org',
        numOfStudentSeats: 40,
        numOfTeacherSeats: 8,
        accessExpiresAt: null,
        reporterEnabled: true,
        assignmentTypeAssignments: [{ assignmentTypeId: 'type-2' }],
      });
    const body = JSON.stringify({
      name: 'Updated Org',
      numOfStudentSeats: 40,
      numOfTeacherSeats: 8,
      accessExpiresAt: null,
      featureToggles: { reporterEnabled: true },
      assignmentTypeIds: ['type-2'],
    });

    const res = await internalAdminOrganizationUpdate(new Request(`${base}/org-1`, { method: 'PATCH', body }), 'org-1');

    expect(res.status).toBe(200);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: expect.objectContaining({
        name: 'Updated Org',
        numOfStudentSeats: 40,
        numOfTeacherSeats: 8,
        reporterEnabled: true,
      }),
    });
    expect(prisma.organizationAssignmentType.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    });
    expect(prisma.organizationAssignmentType.createMany).toHaveBeenCalledWith({
      data: [{ organizationId: 'org-1', assignmentTypeId: 'type-2' }],
      skipDuplicates: true,
    });
  });
});
