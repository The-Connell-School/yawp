import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';

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
const recordInternalPlatformWriteAudit = mock();
const internalApiRawQueryString = (url: URL | string) => {
  const search = typeof url === 'string' ? new URL(url).search : url.search;
  return search.startsWith('?') ? search.slice(1) : search;
};

mock.module('./db.server', () => ({ prisma }));
mock.module('./db.server.ts', () => ({ prisma }));
mock.module('./db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.ts', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module(
  '/home/bryant/work/yawp/codex-loop/worktrees/admin-migrate-2-platform/services/web-app/app/utils/db.server.ts',
  () => ({ prisma })
);
mock.module('./internal-platform-auth.server', () => ({
  authorizeInternalApiRequest,
  internalApiRawQueryString,
  recordInternalPlatformWriteAudit,
}));
mock.module('./internal-platform-auth.server.ts', () => ({
  authorizeInternalApiRequest,
  internalApiRawQueryString,
  recordInternalPlatformWriteAudit,
}));
mock.module('./internal-platform-auth.server.js', () => ({
  authorizeInternalApiRequest,
  internalApiRawQueryString,
  recordInternalPlatformWriteAudit,
}));
mock.module(
  '/home/bryant/work/yawp/codex-loop/worktrees/admin-migrate-2-platform/services/web-app/app/utils/internal-platform-auth.server.ts',
  () => ({
    authorizeInternalApiRequest,
    internalApiRawQueryString,
    recordInternalPlatformWriteAudit,
  })
);
mock.module('~/utils/preview-access.server', () => ({
  isIsolatedPreviewSeatMode,
  getConfiguredPreviewOrganizationAccessCode,
}));
mock.module('~/utils/preview-access.server.ts', () => ({
  isIsolatedPreviewSeatMode,
  getConfiguredPreviewOrganizationAccessCode,
}));
mock.module(
  '/home/bryant/work/yawp/codex-loop/worktrees/admin-migrate-2-platform/services/web-app/app/utils/preview-access.server.ts',
  () => ({
    isIsolatedPreviewSeatMode,
    getConfiguredPreviewOrganizationAccessCode,
  })
);

const {
  internalAdminOrganizationCreate,
  internalAdminOrganizationDetail,
  internalAdminOrganizationUpdate,
  internalAdminOrganizationsList,
} = await import('./internal-admin-organizations.server');

function dependencies() {
  return { ...prisma, preview: { isIsolatedPreviewSeatMode, getConfiguredPreviewOrganizationAccessCode } };
}

const base = 'https://yawp.test/api/internal/v1/admin/organizations';

function authed(url = base) {
  return new Request(url);
}

function requestHash(body: string) {
  return createHash('sha256').update(body).digest('hex');
}

// Transactions overlap until the handler takes a database lock. Reads outside
// the transaction can therefore reproduce both reviewed races deterministically.
function concurrentDatabase(options: { failAudit?: boolean; initial?: any } = {}) {
  const rows = new Map<string, any>();
  if (options.initial) rows.set(options.initial.id, structuredClone(options.initial));
  const audits: any[] = [];
  const locks = new Map<string, Promise<void>>();
  const organization = {
    create: async ({ data }: any) => {
      const row = { ...data, id: `org-${rows.size + 1}`, assignmentTypeAssignments: [] };
      rows.set(row.id, row);
      return structuredClone(row);
    },
    findUnique: async ({ where }: any) => structuredClone(rows.get(where.id) ?? null),
    update: async ({ where, data }: any) => {
      const row = { ...rows.get(where.id), ...data };
      rows.set(where.id, row);
      return structuredClone(row);
    },
  };
  const assignmentType = { findMany: async ({ where }: any) => where.id.in.map((id: string) => ({ id })) };
  const organizationAssignmentType = {
    deleteMany: async ({ where }: any) => { rows.get(where.organizationId).assignmentTypeAssignments = []; },
    createMany: async ({ data }: any) => {
      for (const link of data) rows.get(link.organizationId).assignmentTypeAssignments.push({ assignmentTypeId: link.assignmentTypeId });
    },
  };
  const internalPlatformApiAudit = {
    findFirst: async ({ where }: any) => structuredClone(audits.find((a) =>
      a.action === where.action && a.actorEmail === where.actorEmail && a.keyId === where.keyId &&
      a.metadata.idempotencyKey === where.metadata.equals
    ) ?? null),
    createMany: async ({ data }: any) => {
      if (options.failAudit) throw new Error('Transactional audit failed');
      audits.push(...structuredClone(data));
    },
  };
  const delegates = { organization, assignmentType, organizationAssignmentType, internalPlatformApiAudit };
  prisma.organization.findUnique.mockImplementation(organization.findUnique);
  prisma.internalPlatformApiAudit.findFirst.mockImplementation(internalPlatformApiAudit.findFirst);
  prisma.assignmentType.findMany.mockImplementation(assignmentType.findMany);
  prisma.$transaction.mockImplementation(async (fn: any) => {
    const initialRows = structuredClone(rows);
    const initialAudits = structuredClone(audits);
    const releases: (() => void)[] = [];
    try {
      return await fn({
        ...delegates,
        $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
          const key = `${sql.join('?').includes('FOR UPDATE') ? 'row' : 'replay'}:${values[0]}`;
          const previous = locks.get(key) ?? Promise.resolve();
          const held = new Promise<void>((resolve) => releases.push(resolve));
          locks.set(key, previous.then(() => held));
          await previous;
          return [{ locked: 1 }];
        },
      });
    } catch (error) {
      rows.clear();
      for (const [id, row] of initialRows) rows.set(id, row);
      audits.splice(0, audits.length, ...initialAudits);
      throw error;
    } finally {
      for (const release of releases) release();
    }
  });
  return { rows, audits };
}

function writeRequest(name: string, method = 'POST', key = 'concurrent-create', fields: Record<string, unknown> = {}) {
  return new Request(method === 'POST' ? base : `${base}/org-1`, {
    method,
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({ name, numOfStudentSeats: 30, numOfTeacherSeats: 4, assignmentTypeIds: [], ...fields }),
  });
}

describe('internal admin organization endpoints', () => {
  beforeEach(() => {
    authorizeInternalApiRequest.mockReset().mockResolvedValue({
      mode: 'hmac',
      keyId: 'reader',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:read'],
    });
    recordInternalPlatformWriteAudit.mockReset().mockResolvedValue(undefined);
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
    prisma.internalPlatformApiAudit.findFirst
      .mockReset()
      .mockResolvedValue(null);
    prisma.$transaction
      .mockReset()
      .mockImplementation(async (fn: any) => fn(prisma));
    prisma.$queryRaw.mockReset().mockResolvedValue([
      {
        total_organizations: 0,
        active_organizations: 0,
        total_students: 0,
        total_teachers: 0,
      },
    ]);
    isIsolatedPreviewSeatMode.mockReset().mockReturnValue(false);
    getConfiguredPreviewOrganizationAccessCode
      .mockReset()
      .mockReturnValue(null);
  });

  test('rejects unauthorized list requests before reading organizations', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const res = await internalAdminOrganizationsList(new Request(base));

    expect(res.status).toBe(401);
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
  });

  test('rejects unauthorized detail requests before reading organizations', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const res = await internalAdminOrganizationDetail(
      new Request(`${base}/org-1`),
      'org-1'
    );

    expect(res.status).toBe(401);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  test('rejects unauthorized create requests before mutating organizations', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const body = JSON.stringify({
      name: 'New Org',
      numOfStudentSeats: 30,
      numOfTeacherSeats: 10,
    });

    const res = await internalAdminOrganizationCreate(
      new Request(base, { method: 'POST', body })
    );

    expect(res.status).toBe(401);
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  test('rejects legacy bearer create requests before mutating organizations', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce({
      mode: 'legacy',
      keyId: 'legacy',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:write'],
    });
    const body = JSON.stringify({
      name: 'New Org',
      numOfStudentSeats: 30,
      numOfTeacherSeats: 10,
    });

    const res = await internalAdminOrganizationCreate(
      new Request(base, { method: 'POST', body })
    );

    expect(res.status).toBe(401);
    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(prisma.internalPlatformApiAudit.findFirst).not.toHaveBeenCalled();
  });

  test('rejects invalid-signature update requests before mutating organizations', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce(
      Response.json({ error: 'Invalid signature' }, { status: 403 })
    );
    const body = JSON.stringify({
      name: 'Updated Org',
      numOfStudentSeats: 30,
      numOfTeacherSeats: 10,
    });

    const res = await internalAdminOrganizationUpdate(
      new Request(`${base}/org-1`, { method: 'PATCH', body }),
      'org-1'
    );

    expect(res.status).toBe(403);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  test('rejects legacy bearer update requests before reading or mutating organizations', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce({
      mode: 'legacy',
      keyId: 'legacy',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:write'],
    });
    const body = JSON.stringify({
      name: 'Updated Org',
      numOfStudentSeats: 30,
      numOfTeacherSeats: 10,
    });

    const res = await internalAdminOrganizationUpdate(
      new Request(`${base}/org-1`, { method: 'PATCH', body }),
      'org-1'
    );

    expect(res.status).toBe(401);
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  test('validates bounded pagination and sort inputs', async () => {
    expect(
      (await internalAdminOrganizationsList(authed(`${base}?pageSize=101`)))
        .status
    ).toBe(400);
    expect(
      (await internalAdminOrganizationsList(authed(`${base}?sort=bogus`)))
        .status
    ).toBe(400);

    const res = await internalAdminOrganizationsList(
      authed(`${base}?page=2&pageSize=10&sort=name&direction=asc&q=demo`)
    );
    expect(res.status).toBe(200);
    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: { name: { contains: 'demo', mode: 'insensitive' } },
        orderBy: { name: 'asc' },
      })
    );
    expect(recordInternalPlatformWriteAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actorEmail: 'ops@yawp.test',
        keyId: 'reader',
        endpoint: 'GET /api/internal/v1/admin/organizations',
        result: 'organizations.list.success',
      })
    );
  });

  test('returns preview codes only when preview seats are supported', async () => {
    prisma.organization.findMany.mockResolvedValue([
      {
        id: 'org-1',
        name: 'Demo Org',
        createdAt: new Date('2026-10-01T00:00:00Z'),
        updatedAt: new Date('2026-10-01T00:00:00Z'),
        numOfStudentSeats: 30,
        numOfTeacherSeats: 5,
        previewSeatCode: 'secret-preview-code',
        reporterEnabled: true,
        memberships: [{ role: 'STUDENT', isActive: true }],
      },
    ]);

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
      memberships: [
        {
          id: 'm-1',
          role: 'TEACHER',
          isOrgOwner: true,
          isActive: true,
          user: { id: 'u-1', name: 'Owner', email: 'owner@yawp.test' },
        },
      ],
      assignmentTypeAssignments: [{ assignmentTypeId: 'type-1' }],
    });
    prisma.organization.count.mockResolvedValue(1);
    prisma.assignmentType.findMany.mockResolvedValue([
      { id: 'type-1', title: 'Essay', description: null },
      { id: 'type-2', title: 'DBQ', description: null },
    ]);
    prisma.invitation.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        createdAt: new Date('2026-10-02T00:00:00Z'),
        target: 'pending@yawp.test',
        expiresAt: null,
      },
    ]);

    const res = await internalAdminOrganizationDetail(
      authed(`${base}/org-1`),
      'org-1'
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.organization.owners).toHaveLength(1);
    expect(body.organization.pendingOwnerInvitations[0].target).toBe(
      'pending@yawp.test'
    );
    expect(
      body.organization.assignmentTypes.map(
        (t: { available: boolean }) => t.available
      )
    ).toEqual([true, false]);
    expect(body.organization.deleteEligibility).toEqual({
      canDelete: false,
      reasons: ['Only organization in this environment'],
    });
    expect(body.organization.previewSeatCode).toBeUndefined();
    expect(recordInternalPlatformWriteAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actorEmail: 'ops@yawp.test',
        keyId: 'reader',
        endpoint: 'GET /api/internal/v1/admin/organizations/org-1',
        result: 'organizations.detail.success',
      })
    );
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

    const res = await internalAdminOrganizationCreate(
      new Request(base, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'create-1' },
        body,
      })
    );

    expect(res.status).toBe(201);
    expect(authorizeInternalApiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      {
        body,
        requiredScope: 'management:write',
      }
    );
    expect(prisma.organizationAssignmentType.createMany).toHaveBeenCalledWith({
      data: [{ organizationId: 'org-1', assignmentTypeId: 'type-1' }],
      skipDuplicates: true,
    });
    expect(prisma.internalPlatformApiAudit.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'organization.create.before',
            result: 'before',
          }),
          expect.objectContaining({
            action: 'organization.create.after',
            result: 'after',
          }),
        ]),
      })
    );
  });

  test('rejects malformed create payloads before writing', async () => {
    authorizeInternalApiRequest.mockResolvedValue({
      mode: 'hmac',
      keyId: 'writer',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:write'],
    });

    expect(
      (
        await internalAdminOrganizationCreate(
          new Request(base, { method: 'POST', body: '{' })
        )
      ).status
    ).toBe(400);
    expect(
      (
        await internalAdminOrganizationCreate(
          new Request(base, {
            method: 'POST',
            body: JSON.stringify({
              name: '',
              numOfStudentSeats: 30,
              numOfTeacherSeats: 10,
            }),
          })
        )
      ).status
    ).toBe(400);
    expect(
      (
        await internalAdminOrganizationCreate(
          new Request(base, {
            method: 'POST',
            body: JSON.stringify({
              name: 'New Org',
              numOfStudentSeats: 30,
              numOfTeacherSeats: 10,
              accessExpiresAt: 'not-a-date',
            }),
          })
        )
      ).status
    ).toBe(400);

    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  test('rejects create requests with unknown assignment types before writing', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce({
      mode: 'hmac',
      keyId: 'writer',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:write'],
    });
    prisma.assignmentType.findMany.mockResolvedValue([]);
    const body = JSON.stringify({
      name: 'New Org',
      numOfStudentSeats: 30,
      numOfTeacherSeats: 10,
      assignmentTypeIds: ['missing-type'],
    });

    const res = await internalAdminOrganizationCreate(
      new Request(base, { method: 'POST', body })
    );

    expect(res.status).toBe(404);
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  test('replays idempotent organization create without creating a duplicate', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce({
      mode: 'hmac',
      keyId: 'writer',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:write'],
    });
    const body = JSON.stringify({
      name: 'Existing Org',
      numOfStudentSeats: 30,
      numOfTeacherSeats: 10,
    });
    prisma.internalPlatformApiAudit.findFirst.mockResolvedValue({
      targetId: 'org-existing',
      requestHash: requestHash(body),
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

    const res = await internalAdminOrganizationCreate(
      new Request(base, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'create-1' },
        body,
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.organization.id).toBe('org-existing');
    expect(prisma.internalPlatformApiAudit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorEmail: 'ops@yawp.test',
          keyId: 'writer',
          metadata: {
            path: ['idempotencyKey'],
            equals: 'create-1',
          },
        }),
      })
    );
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  test('rejects reused create idempotency keys with different payloads', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce({
      mode: 'hmac',
      keyId: 'writer',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:write'],
    });
    const originalBody = JSON.stringify({
      name: 'Existing Org',
      numOfStudentSeats: 30,
      numOfTeacherSeats: 10,
    });
    prisma.internalPlatformApiAudit.findFirst.mockResolvedValue({
      targetId: 'org-existing',
      requestHash: requestHash(originalBody),
      createdAt: new Date(),
    });
    const changedBody = JSON.stringify({
      name: 'Existing Org',
      numOfStudentSeats: 31,
      numOfTeacherSeats: 10,
    });

    const res = await internalAdminOrganizationCreate(
      new Request(base, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'create-1' },
        body: changedBody,
      })
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toContain('different request');
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  test('allows the same create payload with a different idempotency key', async () => {
    authorizeInternalApiRequest.mockResolvedValueOnce({
      mode: 'hmac',
      keyId: 'writer',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:write'],
    });
    prisma.organization.create.mockResolvedValue({ id: 'org-2' });
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-2',
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

    const res = await internalAdminOrganizationCreate(
      new Request(base, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'create-2' },
        body,
      })
    );

    expect(res.status).toBe(201);
    expect(prisma.internalPlatformApiAudit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          metadata: {
            path: ['idempotencyKey'],
            equals: 'create-2',
          },
        }),
      })
    );
    expect(prisma.organization.create).toHaveBeenCalled();
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

    const res = await internalAdminOrganizationUpdate(
      new Request(`${base}/org-1`, { method: 'PATCH', body }),
      'org-1'
    );

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

  test('rejects malformed update payloads before writing', async () => {
    authorizeInternalApiRequest.mockResolvedValue({
      mode: 'hmac',
      keyId: 'writer',
      actorEmail: 'ops@yawp.test',
      scopes: ['management:write'],
    });

    expect(
      (
        await internalAdminOrganizationUpdate(
          new Request(`${base}/org-1`, { method: 'PATCH', body: '{' }),
          'org-1'
        )
      ).status
    ).toBe(400);
    expect(
      (
        await internalAdminOrganizationUpdate(
          new Request(`${base}/org-1`, {
            method: 'PATCH',
            body: JSON.stringify({
              name: 'Updated Org',
              numOfStudentSeats: -1,
              numOfTeacherSeats: 10,
            }),
          }),
          'org-1'
        )
      ).status
    ).toBe(400);
    expect(
      (
        await internalAdminOrganizationUpdate(
          new Request(`${base}/org-1`, {
            method: 'PATCH',
            body: JSON.stringify({
              name: 'Updated Org',
              numOfStudentSeats: 30,
              numOfTeacherSeats: 10,
              accessExpiresAt: 'not-a-date',
            }),
          }),
          'org-1'
        )
      ).status
    ).toBe(400);

    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
  test('overlapping same-key creates return one organization and one audit pair', async () => {
    const { rows, audits } = concurrentDatabase();
    const replies = await Promise.all([
      internalAdminOrganizationCreate(writeRequest('Same Org')),
      internalAdminOrganizationCreate(writeRequest('Same Org')),
    ]);
    const bodies = await Promise.all(replies.map((reply) => reply.json()));
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 201]);
    expect(rows.size).toBe(1);
    expect(bodies[0].organization.id).toBe(bodies[1].organization.id);
    expect(audits.map((audit) => audit.action)).toEqual(['organization.create.before', 'organization.create.after']);
  });

  test('overlapping conflicting bodies for one replay key reject the second mutation', async () => {
    const { rows, audits } = concurrentDatabase();
    const replies = await Promise.all([
      internalAdminOrganizationCreate(writeRequest('First Org')),
      internalAdminOrganizationCreate(writeRequest('Conflicting Org')),
    ]);
    expect(replies.map((reply) => reply.status).sort()).toEqual([201, 409]);
    expect(rows.size).toBe(1);
    expect(audits).toHaveLength(2);
  });

  test('replay keys are scoped to the actor and signing key', async () => {
    const { rows } = concurrentDatabase();
    for (const [actorEmail, keyId] of [['first@yawp.test', 'key-1'], ['second@yawp.test', 'key-1'], ['first@yawp.test', 'key-2']]) {
      authorizeInternalApiRequest.mockResolvedValueOnce({ mode: 'hmac', actorEmail, keyId, scopes: ['management:write'] });
      expect((await internalAdminOrganizationCreate(writeRequest('Same Org'))).status).toBe(201);
    }
    expect(rows.size).toBe(3);
  });

  test('overlapping updates audit the exact overwritten fields and assignments', async () => {
    const initial = { id: 'org-1', name: 'Original', numOfStudentSeats: 10, numOfTeacherSeats: 2, accessExpiresAt: null, reporterEnabled: false, assignmentTypeAssignments: [{ assignmentTypeId: 'original-type' }] };
    const { rows, audits } = concurrentDatabase({ initial });
    const replies = await Promise.all([
      internalAdminOrganizationUpdate(writeRequest('First', 'PATCH', '', { numOfStudentSeats: 40, accessExpiresAt: '2027-01-01T00:00:00.000Z', featureToggles: { reporterEnabled: true }, assignmentTypeIds: ['type-1'] }), 'org-1'),
      internalAdminOrganizationUpdate(writeRequest('Second', 'PATCH', '', { numOfStudentSeats: 60, numOfTeacherSeats: 8, accessExpiresAt: '2028-01-01T00:00:00.000Z', featureToggles: { reporterEnabled: false }, assignmentTypeIds: ['type-2'] }), 'org-1'),
    ]);
    expect(replies.map((reply) => reply.status)).toEqual([200, 200]);
    const before = audits.filter((audit) => audit.result === 'before').map((audit) => audit.metadata.before);
    const after = audits.filter((audit) => audit.result === 'after').map((audit) => audit.metadata.after);
    expect(before[0].name).toBe('Original');
    expect(before[0].assignmentTypeIds).toEqual(['original-type']);
    expect(before[1]).toEqual(after[0]);
    expect(after[1]).toEqual(expect.objectContaining({ name: rows.get('org-1').name, assignmentTypeIds: ['type-2'] }));
  });

  test('create rolls back organization and assignments if its audit fails', async () => {
    const { rows, audits } = concurrentDatabase({ failAudit: true });
    await expect(internalAdminOrganizationCreate(writeRequest('Rollback', 'POST', 'rollback', { assignmentTypeIds: ['type-1'] }))).rejects.toThrow('Transactional audit failed');
    expect(rows.size).toBe(0);
    expect(audits).toHaveLength(0);
  });

  test('update rolls back fields and assignments if its audit fails', async () => {
    const initial = { id: 'org-1', name: 'Original', numOfStudentSeats: 10, numOfTeacherSeats: 2, accessExpiresAt: null, assignmentTypeAssignments: [{ assignmentTypeId: 'original-type' }] };
    const { rows, audits } = concurrentDatabase({ failAudit: true, initial });
    await expect(internalAdminOrganizationUpdate(writeRequest('Rollback', 'PATCH', '', { assignmentTypeIds: ['type-2'] }), 'org-1')).rejects.toThrow('Transactional audit failed');
    expect(rows.get('org-1')).toEqual(initial);
    expect(audits).toHaveLength(0);
  });

});
