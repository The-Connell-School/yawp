import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  organization: {
    findMany: mock(),
    findUnique: mock(),
    count: mock(),
    groupBy: mock(),
  },
  assignmentType: {
    findMany: mock(),
  },
  invitation: {
    findMany: mock(),
  },
  $queryRaw: mock(),
  internalApiRequestNonce: {
    deleteMany: mock(),
    create: mock(),
  },
};

const isIsolatedPreviewSeatMode = mock();
const getConfiguredPreviewOrganizationAccessCode = mock();
const authorizeInternalApiRequest = mock();
const recordInternalPlatformWriteAudit = mock();
const internalApiRawQueryString = (url: URL | string) => {
  const search = typeof url === 'string' ? new URL(url).search : url.search;
  return search.startsWith('?') ? search.slice(1) : search;
};

mock.module('./db.server', () => ({ prisma }));
mock.module('./db.server.ts', () => ({ prisma }));
mock.module('./db.server.js', () => ({ prisma }));
mock.module('/home/bryant/work/yawp/codex-loop/worktrees/admin-migrate-2-platform/services/web-app/app/utils/db.server.ts', () => ({ prisma }));
mock.module('file:///home/bryant/work/yawp/codex-loop/worktrees/admin-migrate-2-platform/services/web-app/app/utils/db.server.ts', () => ({ prisma }));
mock.module('./internal-platform-auth.server', () => ({ authorizeInternalApiRequest, recordInternalPlatformWriteAudit, internalApiRawQueryString }));
mock.module('./internal-platform-auth.server.ts', () => ({ authorizeInternalApiRequest, recordInternalPlatformWriteAudit, internalApiRawQueryString }));
mock.module('./internal-platform-auth.server.js', () => ({ authorizeInternalApiRequest, recordInternalPlatformWriteAudit, internalApiRawQueryString }));
mock.module('/home/bryant/work/yawp/codex-loop/worktrees/admin-migrate-2-platform/services/web-app/app/utils/internal-platform-auth.server.ts', () => ({ authorizeInternalApiRequest, recordInternalPlatformWriteAudit, internalApiRawQueryString }));
mock.module('file:///home/bryant/work/yawp/codex-loop/worktrees/admin-migrate-2-platform/services/web-app/app/utils/internal-platform-auth.server.ts', () => ({ authorizeInternalApiRequest, recordInternalPlatformWriteAudit, internalApiRawQueryString }));
const {
  internalAdminOrganizationDetail,
  internalAdminOrganizationsList,
} = await import('./internal-admin-organizations.server');

const base = 'https://yawp.test/api/internal/v1/admin/organizations';

function authed(url = base) {
  return new Request(url);
}

function deps() {
  return {
    organization: prisma.organization,
    assignmentType: prisma.assignmentType,
    invitation: prisma.invitation,
    $queryRaw: prisma.$queryRaw,
    preview: {
      isIsolatedPreviewSeatMode,
      getConfiguredPreviewOrganizationAccessCode,
    },
  } as never;
}

describe('internal admin organization endpoints', () => {
  beforeEach(() => {
    authorizeInternalApiRequest.mockReset().mockResolvedValue({
      mode: 'hmac',
      keyId: 'internal-dev',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:read'],
    });
    recordInternalPlatformWriteAudit.mockReset().mockResolvedValue(undefined);
    prisma.organization.findMany.mockReset().mockResolvedValue([]);
    prisma.organization.findUnique.mockReset().mockResolvedValue(null);
    prisma.organization.count.mockReset().mockResolvedValue(0);
    prisma.organization.groupBy.mockReset().mockResolvedValue([]);
    prisma.assignmentType.findMany.mockReset().mockResolvedValue([]);
    prisma.invitation.findMany.mockReset().mockResolvedValue([]);
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
    const res = await internalAdminOrganizationsList(new Request(base), deps());

    expect(res.status).toBe(401);
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
  });

  test('rejects unauthorized detail requests before reading organizations', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await internalAdminOrganizationDetail(new Request(`${base}/org-1`), 'org-1', deps());

    expect(res.status).toBe(401);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  test('rejects legacy bearer access before reading organizations', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce({
      mode: 'legacy',
      keyId: 'legacy',
      actorEmail: 'legacy@yawp.internal',
      scopes: ['management:read'],
    });

    const res = await internalAdminOrganizationsList(new Request(base), deps());

    expect(res.status).toBe(401);
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
  });

  test('validates bounded pagination and sort inputs', async () => {
    expect((await internalAdminOrganizationsList(authed(`${base}?pageSize=101`), deps())).status).toBe(400);
    expect((await internalAdminOrganizationsList(authed(`${base}?sort=bogus`), deps())).status).toBe(400);

    const res = await internalAdminOrganizationsList(authed(`${base}?page=2&pageSize=10&sort=name&direction=asc&q=demo`), deps());
    expect(res.status).toBe(200);
    expect(prisma.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      where: { name: { contains: 'demo', mode: 'insensitive' } },
      orderBy: { name: 'asc' },
    }));
    expect(recordInternalPlatformWriteAudit).toHaveBeenLastCalledWith(expect.objectContaining({
      actorEmail: 'ops@yawp.test',
      keyId: 'internal-dev',
      endpoint: 'GET /api/internal/v1/admin/organizations',
      result: 'organizations.list.success',
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
      apiToken: 'future-secret',
      reporterEnabled: true,
      memberships: [{ role: 'STUDENT', isActive: true }],
    }]);

    let body = await (await internalAdminOrganizationsList(authed(), deps())).json();
    expect(body.previewSeatMode).toBe(false);
    expect(body.organizations[0].previewAccessCode).toBeNull();

    isIsolatedPreviewSeatMode.mockReturnValue(true);
    body = await (await internalAdminOrganizationsList(authed(), deps())).json();
    expect(body.previewSeatMode).toBe(true);
    expect(body.organizations[0].previewAccessCode).toBe('secret-preview-code');
    expect(body.organizations[0].previewSeatCode).toBeUndefined();
    expect(body.organizations[0].apiToken).toBeUndefined();
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
      apiToken: 'future-secret',
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

    const res = await internalAdminOrganizationDetail(authed(`${base}/org-1`), 'org-1', deps());
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
    expect(body.organization.apiToken).toBeUndefined();
    expect(recordInternalPlatformWriteAudit).toHaveBeenLastCalledWith(expect.objectContaining({
      endpoint: 'GET /api/internal/v1/admin/organizations/org-1',
      result: 'organizations.detail.success',
    }));
  });
});
