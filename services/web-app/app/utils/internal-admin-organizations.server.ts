import { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  authorizeInternalApiRequest,
  type InternalApiAuthContext,
} from './internal-platform-auth.server';
import { prisma } from './db.server';
import {
  getConfiguredPreviewOrganizationAccessCode,
  isIsolatedPreviewSeatMode,
} from '~/utils/preview-access.server';

const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });

const sortSchema = z.enum([
  'name',
  'createdAt',
  'studentSeats',
  'teacherSeats',
]);
const directionSchema = z.enum(['asc', 'desc']);

const featureToggleKeys = [
  'reporterEnabled',
  'classInsightsEnabled',
  'writingPracticeEnabled',
  'submissionActivityEnabled',
  'revisionFlowEnabled',
  'apHistoryEnabled',
  'collaborativeDraftsEnabled',
  'studentDocumentSharingEnabled',
] as const;

type FeatureToggleKey = (typeof featureToggleKeys)[number];

type OrganizationListDb = {
  findMany: typeof prisma.organization.findMany;
  count: typeof prisma.organization.count;
  groupBy: typeof prisma.organization.groupBy;
};

type OrganizationDetailDb = OrganizationListDb & {
  findUnique: typeof prisma.organization.findUnique;
};

type Dependencies = {
  organization: OrganizationListDb & OrganizationDetailDb;
  organizationAssignmentType: Pick<
    typeof prisma.organizationAssignmentType,
    'deleteMany' | 'createMany'
  >;
  assignmentType: Pick<typeof prisma.assignmentType, 'findMany'>;
  invitation: Pick<typeof prisma.invitation, 'findMany'>;
  internalPlatformApiAudit: Pick<
    typeof prisma.internalPlatformApiAudit,
    'create' | 'createMany' | 'findFirst'
  >;
  $transaction: typeof prisma.$transaction;
  $queryRaw: typeof prisma.$queryRaw;
};

const deps: Dependencies = prisma;

function parseListQuery(url: URL) {
  const parsed = z
    .object({
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
      sort: sortSchema.default('createdAt'),
      direction: directionSchema.default('desc'),
      q: z.string().trim().max(120).optional().default(''),
    })
    .safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return null;
  return parsed.data;
}

function seatCounts(
  memberships: { role: string; isActive?: boolean | null }[]
) {
  const active = memberships.filter((m) => m.isActive !== false);
  return {
    studentsUsed: active.filter((m) => m.role === 'STUDENT').length,
    teachersUsed: active.filter((m) => m.role === 'TEACHER').length,
    totalMembers: active.length,
  };
}

function featureToggles(row: Record<string, unknown>) {
  return Object.fromEntries(
    featureToggleKeys.map((key) => [key, row[key] === true])
  );
}

function listOrderBy(
  sort: z.infer<typeof sortSchema>,
  direction: z.infer<typeof directionSchema>
) {
  if (sort === 'studentSeats') return { numOfStudentSeats: direction };
  if (sort === 'teacherSeats') return { numOfTeacherSeats: direction };
  return { [sort]: direction };
}

function previewAccessCode(
  id: string,
  code: string | null | undefined,
  previewSeatMode: boolean
) {
  if (!previewSeatMode) return null;
  return code ?? getConfiguredPreviewOrganizationAccessCode(id);
}

const organizationWriteSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    numOfStudentSeats: z.coerce.number().int().min(0).max(100_000),
    numOfTeacherSeats: z.coerce.number().int().min(0).max(100_000),
    accessExpiresAt: z.string().trim().max(80).nullable().optional(),
    featureToggles: z
      .object({
        reporterEnabled: z.boolean().optional(),
        classInsightsEnabled: z.boolean().optional(),
        writingPracticeEnabled: z.boolean().optional(),
        submissionActivityEnabled: z.boolean().optional(),
        revisionFlowEnabled: z.boolean().optional(),
        apHistoryEnabled: z.boolean().optional(),
        collaborativeDraftsEnabled: z.boolean().optional(),
        studentDocumentSharingEnabled: z.boolean().optional(),
      })
      .optional()
      .default({}),
    assignmentTypeIds: z
      .array(z.string().min(1))
      .max(500)
      .optional()
      .default([]),
  })
  .strict();

function parseAccessExpiresAt(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return undefined;
  return date;
}

function requestHash(body: string) {
  return createHash('sha256').update(body).digest('hex');
}

function snapshotOrganization(row: any) {
  if (!row) return null;
  const assignmentTypeIds = (row.assignmentTypeAssignments ?? [])
    .map((link: any) => link.assignmentTypeId)
    .sort();
  return {
    id: row.id,
    name: row.name,
    numOfStudentSeats: row.numOfStudentSeats,
    numOfTeacherSeats: row.numOfTeacherSeats,
    accessExpiresAt: row.accessExpiresAt,
    featureToggles: featureToggles(row),
    assignmentTypeIds,
  };
}

async function writeAuditRows(
  tx: any,
  args: {
    auth: { actorEmail: string; keyId: string };
    endpoint: string;
    hash: string;
    action: string;
    targetId: string;
    before: unknown;
    after: unknown;
    idempotencyKey?: string | null;
  }
) {
  await tx.internalPlatformApiAudit.createMany({
    data: [
      {
        actorEmail: args.auth.actorEmail,
        keyId: args.auth.keyId,
        endpoint: args.endpoint,
        requestHash: args.hash,
        result: 'before',
        action: `${args.action}.before`,
        targetId: args.targetId,
        metadata: {
          before: args.before,
          idempotencyKey: args.idempotencyKey ?? null,
        },
      },
      {
        actorEmail: args.auth.actorEmail,
        keyId: args.auth.keyId,
        endpoint: args.endpoint,
        requestHash: args.hash,
        result: 'after',
        action: `${args.action}.after`,
        targetId: args.targetId,
        metadata: {
          after: args.after,
          idempotencyKey: args.idempotencyKey ?? null,
        },
      },
    ],
  });
}

type ParsedWriteRequest =
  | {
      ok: true;
      auth: InternalApiAuthContext;
      body: string;
      data: Omit<
        z.infer<typeof organizationWriteSchema>,
        'accessExpiresAt' | 'assignmentTypeIds'
      > & { accessExpiresAt: Date | null; assignmentTypeIds: string[] };
    }
  | { ok: false; response: Response };

async function parseWriteRequest(
  request: Request
): Promise<ParsedWriteRequest> {
  const body = await request.text();
  const auth = await authorizeInternalApiRequest(request, {
    body,
    requiredScope: 'management:write',
  });
  if (auth instanceof Response) return { ok: false, response: auth };
  if (auth.mode !== 'hmac')
    return { ok: false, response: response({ error: 'Unauthorized' }, 401) };
  let raw: unknown;
  try {
    raw = JSON.parse(body || '{}');
  } catch {
    return { ok: false, response: response({ error: 'Invalid JSON' }, 400) };
  }
  const parsed = organizationWriteSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      response: response({ error: 'Invalid organization request' }, 400),
    };
  const accessExpiresAt = parseAccessExpiresAt(parsed.data.accessExpiresAt);
  if (accessExpiresAt === undefined)
    return {
      ok: false,
      response: response({ error: 'Invalid access expiration' }, 400),
    };
  return {
    ok: true,
    auth,
    body,
    data: {
      ...parsed.data,
      accessExpiresAt,
      assignmentTypeIds: Array.from(new Set(parsed.data.assignmentTypeIds)),
    },
  };
}

export async function internalAdminOrganizationsList(
  request: Request,
  client: Dependencies = deps
) {
  if (request.method !== 'GET')
    return response({ error: 'Method not allowed' }, 405);
  const auth = await authorizeInternalApiRequest(request, {
    requiredScope: 'management:read',
  });
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const query = parseListQuery(url);
  if (!query) return response({ error: 'Invalid query' }, 400);

  const where = query.q
    ? { name: { contains: query.q, mode: 'insensitive' as const } }
    : {};
  const skip = (query.page - 1) * query.pageSize;
  const previewSeatMode = isIsolatedPreviewSeatMode();

  const [rows, totalCount, stats, growthData] = await Promise.all([
    client.organization.findMany({
      where,
      skip,
      take: query.pageSize,
      include: { memberships: { select: { role: true, isActive: true } } },
      orderBy: listOrderBy(query.sort, query.direction),
    }),
    client.organization.count({ where }),
    client.$queryRaw<
      {
        total_organizations: number;
        active_organizations: number;
        total_students: number;
        total_teachers: number;
      }[]
    >`
      SELECT
        (SELECT COUNT(*) FROM "Organization")::int as total_organizations,
        (SELECT COUNT(*) FROM "Organization" WHERE "createdAt" > NOW() - INTERVAL '30 days')::int as active_organizations,
        (SELECT COUNT(*) FROM "OrgMembership" WHERE role = 'STUDENT' AND "isActive" = true)::int as total_students,
        (SELECT COUNT(*) FROM "OrgMembership" WHERE role = 'TEACHER' AND "isActive" = true)::int as total_teachers
    `,
    client.organization.groupBy({
      by: ['createdAt'],
      _count: true,
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return response({
    organizations: (rows as any[]).map(
      ({ previewSeatCode, memberships, ...row }) => {
        const seats = seatCounts(memberships ?? []);
        return {
          ...row,
          seats: {
            student: { used: seats.studentsUsed, total: row.numOfStudentSeats },
            teacher: { used: seats.teachersUsed, total: row.numOfTeacherSeats },
            members: seats.totalMembers,
          },
          featureToggles: featureToggles(row),
          previewAccessCode: previewAccessCode(
            row.id,
            previewSeatCode,
            previewSeatMode
          ),
        };
      }
    ),
    stats: stats[0] ?? {
      total_organizations: 0,
      active_organizations: 0,
      total_students: 0,
      total_teachers: 0,
    },
    growthData,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / query.pageSize)),
      sort: query.sort,
      direction: query.direction,
      q: query.q,
    },
    previewSeatMode,
    meta: { requestedBy: auth.actorEmail, keyId: auth.keyId },
  });
}

export async function internalAdminOrganizationDetail(
  request: Request,
  id: string | undefined,
  client: Dependencies = deps
) {
  if (request.method !== 'GET')
    return response({ error: 'Method not allowed' }, 405);
  const auth = await authorizeInternalApiRequest(request, {
    requiredScope: 'management:read',
  });
  if (auth instanceof Response) return auth;
  if (!id) return response({ error: 'Organization id is required' }, 400);

  const [organization, invitations, totalOrganizations, assignmentTypes] =
    await Promise.all([
      client.organization.findUnique({
        where: { id },
        include: {
          memberships: {
            select: {
              id: true,
              role: true,
              isOrgOwner: true,
              isActive: true,
              user: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          assignmentTypeAssignments: {
            include: {
              assignmentType: {
                select: { id: true, title: true, description: true },
              },
            },
            orderBy: { assignmentType: { position: 'asc' } },
          },
        },
      }),
      client.invitation.findMany({
        where: {
          type: 'onboard-owner',
          OR: [
            { organizationId: id },
            { metadata: JSON.stringify({ organizationId: id }) },
          ],
        },
        select: { id: true, createdAt: true, target: true, expiresAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      client.organization.count(),
      client.assignmentType.findMany({
        where: { archivedAt: null },
        select: { id: true, title: true, description: true },
        orderBy: { position: 'asc' },
      }),
    ]);

  if (!organization) return response({ error: 'Not found' }, 404);

  const seats = seatCounts(organization.memberships);
  const assigned = new Set(
    (organization.assignmentTypeAssignments as any[]).map(
      (a) => a.assignmentTypeId
    )
  );
  const previewSeatMode = isIsolatedPreviewSeatMode();

  return response({
    organization: {
      ...organization,
      memberships: undefined,
      assignmentTypeAssignments: undefined,
      previewSeatCode: undefined,
      seats: {
        student: {
          used: seats.studentsUsed,
          total: organization.numOfStudentSeats,
        },
        teacher: {
          used: seats.teachersUsed,
          total: organization.numOfTeacherSeats,
        },
        members: seats.totalMembers,
      },
      owners: organization.memberships
        .filter((m: any) => m.isOrgOwner && m.isActive !== false)
        .map((m: any) => ({ id: m.id, role: m.role, user: m.user })),
      pendingOwnerInvitations: invitations,
      assignmentTypes: (assignmentTypes as any[]).map((assignmentType) => ({
        ...assignmentType,
        available: assigned.has(assignmentType.id),
      })),
      featureToggles: featureToggles(organization),
      deleteEligibility: {
        canDelete: totalOrganizations > 1,
        reasons:
          totalOrganizations <= 1
            ? ['Only organization in this environment']
            : [],
      },
      previewAccessCode: previewAccessCode(
        organization.id,
        organization.previewSeatCode,
        previewSeatMode
      ),
    },
    previewSeatMode,
    meta: { requestedBy: auth.actorEmail, keyId: auth.keyId },
  });
}

export async function internalAdminOrganizationCreate(
  request: Request,
  client: Dependencies = deps
) {
  if (request.method !== 'POST')
    return response({ error: 'Method not allowed' }, 405);
  const parsed = await parseWriteRequest(request);
  if (!parsed.ok) return parsed.response;
  const accessExpiresAt = parsed.data.accessExpiresAt;
  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || null;
  const hash = requestHash(parsed.body);
  if (idempotencyKey) {
    const previous = await client.internalPlatformApiAudit.findFirst({
      where: {
        endpoint: 'POST /api/internal/v1/admin/organizations',
        requestHash: hash,
        result: 'after',
        action: 'organization.create.after',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (previous?.targetId) {
      const existing = await client.organization.findUnique({
        where: { id: previous.targetId },
        include: { assignmentTypeAssignments: true },
      });
      if (existing)
        return response({ organization: snapshotOrganization(existing) });
    }
  }

  const validAssignmentTypes = parsed.data.assignmentTypeIds.length
    ? await client.assignmentType.findMany({
        where: { id: { in: parsed.data.assignmentTypeIds }, archivedAt: null },
        select: { id: true },
      })
    : [];
  if (validAssignmentTypes.length !== parsed.data.assignmentTypeIds.length) {
    return response({ error: 'Assignment type not found' }, 404);
  }

  const created = await client.$transaction(async (tx: any) => {
    const organization = await tx.organization.create({
      data: {
        name: parsed.data.name,
        numOfStudentSeats: parsed.data.numOfStudentSeats,
        numOfTeacherSeats: parsed.data.numOfTeacherSeats,
        accessExpiresAt,
        ...parsed.data.featureToggles,
      },
      include: { assignmentTypeAssignments: true },
    });
    if (parsed.data.assignmentTypeIds.length) {
      await tx.organizationAssignmentType.createMany({
        data: parsed.data.assignmentTypeIds.map((assignmentTypeId) => ({
          organizationId: organization.id,
          assignmentTypeId,
        })),
        skipDuplicates: true,
      });
    }
    const after = await tx.organization.findUnique({
      where: { id: organization.id },
      include: { assignmentTypeAssignments: true },
    });
    await writeAuditRows(tx, {
      auth: parsed.auth,
      endpoint: 'POST /api/internal/v1/admin/organizations',
      hash,
      action: 'organization.create',
      targetId: organization.id,
      before: null,
      after: snapshotOrganization(after),
      idempotencyKey,
    });
    return after;
  });

  return response({ organization: snapshotOrganization(created) }, 201);
}

export async function internalAdminOrganizationUpdate(
  request: Request,
  id: string | undefined,
  client: Dependencies = deps
) {
  if (request.method !== 'PATCH')
    return response({ error: 'Method not allowed' }, 405);
  if (!id) return response({ error: 'Organization id is required' }, 400);
  const parsed = await parseWriteRequest(request);
  if (!parsed.ok) return parsed.response;
  const accessExpiresAt = parsed.data.accessExpiresAt;

  const [before, validAssignmentTypes] = await Promise.all([
    client.organization.findUnique({
      where: { id },
      include: { assignmentTypeAssignments: true },
    }),
    parsed.data.assignmentTypeIds.length
      ? client.assignmentType.findMany({
          where: {
            id: { in: parsed.data.assignmentTypeIds },
            archivedAt: null,
          },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);
  if (!before) return response({ error: 'Not found' }, 404);
  if (validAssignmentTypes.length !== parsed.data.assignmentTypeIds.length) {
    return response({ error: 'Assignment type not found' }, 404);
  }

  const after = await client.$transaction(async (tx: any) => {
    await tx.organization.update({
      where: { id },
      data: {
        name: parsed.data.name,
        numOfStudentSeats: parsed.data.numOfStudentSeats,
        numOfTeacherSeats: parsed.data.numOfTeacherSeats,
        accessExpiresAt,
        ...parsed.data.featureToggles,
      },
    });
    await tx.organizationAssignmentType.deleteMany({
      where: { organizationId: id },
    });
    if (parsed.data.assignmentTypeIds.length) {
      await tx.organizationAssignmentType.createMany({
        data: parsed.data.assignmentTypeIds.map((assignmentTypeId) => ({
          organizationId: id,
          assignmentTypeId,
        })),
        skipDuplicates: true,
      });
    }
    const updated = await tx.organization.findUnique({
      where: { id },
      include: { assignmentTypeAssignments: true },
    });
    await writeAuditRows(tx, {
      auth: parsed.auth,
      endpoint: `PATCH /api/internal/v1/admin/organizations/${id}`,
      hash: requestHash(parsed.body),
      action: 'organization.update',
      targetId: id,
      before: snapshotOrganization(before),
      after: snapshotOrganization(updated),
    });
    return updated;
  });

  return response({ organization: snapshotOrganization(after) });
}
