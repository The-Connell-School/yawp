import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  authorizeInternalApiRequest,
  internalApiRawQueryString,
  recordInternalPlatformWriteAudit,
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

const sortSchema = z.enum(['name', 'createdAt', 'studentSeats', 'teacherSeats']);
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

type BaseOrganizationFields = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  plan?: string | null;
  planActivatedAt?: Date | null;
  planExpiresAt?: Date | null;
  accessExpiresAt?: Date | null;
  numOfStudentSeats: number;
  numOfTeacherSeats: number;
  previewSeatCode?: string | null;
} & Record<FeatureToggleKey, boolean | null | undefined>;

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
  assignmentType: Pick<typeof prisma.assignmentType, 'findMany'>;
  invitation: Pick<typeof prisma.invitation, 'findMany'>;
  $queryRaw: typeof prisma.$queryRaw;
  preview: {
    isIsolatedPreviewSeatMode: typeof isIsolatedPreviewSeatMode;
    getConfiguredPreviewOrganizationAccessCode: typeof getConfiguredPreviewOrganizationAccessCode;
  };
};

const deps: Dependencies = {
  organization: prisma.organization,
  assignmentType: prisma.assignmentType,
  invitation: prisma.invitation,
  $queryRaw: prisma.$queryRaw,
  preview: {
    isIsolatedPreviewSeatMode,
    getConfiguredPreviewOrganizationAccessCode,
  },
};

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

function seatCounts(memberships: { role: string; isActive?: boolean | null }[]) {
  const active = memberships.filter((m) => m.isActive !== false);
  return {
    studentsUsed: active.filter((m) => m.role === 'STUDENT').length,
    teachersUsed: active.filter((m) => m.role === 'TEACHER').length,
    totalMembers: active.length,
  };
}

function featureToggles(row: Record<string, unknown>) {
  return Object.fromEntries(featureToggleKeys.map((key) => [key, row[key] === true]));
}

function listOrderBy(sort: z.infer<typeof sortSchema>, direction: z.infer<typeof directionSchema>) {
  if (sort === 'studentSeats') return { numOfStudentSeats: direction };
  if (sort === 'teacherSeats') return { numOfTeacherSeats: direction };
  return { [sort]: direction };
}

function previewAccessCode(
  id: string,
  code: string | null | undefined,
  previewSeatMode: boolean,
  getConfiguredAccessCode: (id: string) => string | null
) {
  if (!previewSeatMode) return null;
  return code ?? getConfiguredAccessCode(id);
}

function serializeBaseOrganization(
  row: BaseOrganizationFields,
  memberships: { role: string; isActive?: boolean | null }[],
  previewSeatMode: boolean,
  getConfiguredAccessCode: (id: string) => string | null
) {
  const seats = seatCounts(memberships);
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    name: row.name,
    plan: row.plan,
    planActivatedAt: row.planActivatedAt ?? null,
    planExpiresAt: row.planExpiresAt ?? null,
    accessExpiresAt: row.accessExpiresAt ?? null,
    numOfStudentSeats: row.numOfStudentSeats,
    numOfTeacherSeats: row.numOfTeacherSeats,
    seats: {
      student: { used: seats.studentsUsed, total: row.numOfStudentSeats },
      teacher: { used: seats.teachersUsed, total: row.numOfTeacherSeats },
      members: seats.totalMembers,
    },
    featureToggles: featureToggles(row),
    previewAccessCode: previewAccessCode(
      row.id,
      row.previewSeatCode,
      previewSeatMode,
      getConfiguredAccessCode
    ),
  };
}

const listOrganizationSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  name: true,
  plan: true,
  planActivatedAt: true,
  planExpiresAt: true,
  accessExpiresAt: true,
  numOfStudentSeats: true,
  numOfTeacherSeats: true,
  previewSeatCode: true,
  reporterEnabled: true,
  classInsightsEnabled: true,
  writingPracticeEnabled: true,
  submissionActivityEnabled: true,
  revisionFlowEnabled: true,
  apHistoryEnabled: true,
  collaborativeDraftsEnabled: true,
  studentDocumentSharingEnabled: true,
  memberships: { select: { role: true, isActive: true } },
} as const;

export async function internalAdminOrganizationsList(
  request: Request,
  client: Dependencies = deps
) {
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  const auth = await authorizeInternalApiRequest(request, { requiredScope: 'management:read' });
  if (auth instanceof Response) return auth;
  if (auth.mode !== 'hmac') return response({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const query = parseListQuery(url);
  if (!query) return response({ error: 'Invalid query' }, 400);

  const where = query.q
    ? { name: { contains: query.q, mode: 'insensitive' as const } }
    : {};
  const skip = (query.page - 1) * query.pageSize;
  const previewSeatMode = client.preview.isIsolatedPreviewSeatMode();

  const [rows, totalCount, stats, growthData] = await Promise.all([
    client.organization.findMany({
      where,
      skip,
      take: query.pageSize,
      select: listOrganizationSelect,
      orderBy: listOrderBy(query.sort, query.direction),
    }),
    client.organization.count({ where }),
    client.$queryRaw<{
      total_organizations: number;
      active_organizations: number;
      total_students: number;
      total_teachers: number;
    }[]>`
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

  const payload = {
    organizations: (rows as (BaseOrganizationFields & {
      memberships: { role: string; isActive?: boolean | null }[];
    })[]).map((row) =>
      serializeBaseOrganization(
        row,
        row.memberships ?? [],
        previewSeatMode,
        client.preview.getConfiguredPreviewOrganizationAccessCode
      )
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
  };
  await auditInternalAdminOrganizationRead(request, auth, 'organizations.list.success');
  return response(payload);
}

export async function internalAdminOrganizationDetail(
  request: Request,
  id: string | undefined,
  client: Dependencies = deps
) {
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  const auth = await authorizeInternalApiRequest(request, { requiredScope: 'management:read' });
  if (auth instanceof Response) return auth;
  if (auth.mode !== 'hmac') return response({ error: 'Unauthorized' }, 401);
  if (!id) return response({ error: 'Organization id is required' }, 400);

  const [organization, invitations, totalOrganizations, assignmentTypes] = await Promise.all([
    client.organization.findUnique({
      where: { id },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        name: true,
        plan: true,
        planActivatedAt: true,
        planExpiresAt: true,
        accessExpiresAt: true,
        numOfStudentSeats: true,
        numOfTeacherSeats: true,
        previewSeatCode: true,
        reporterEnabled: true,
        classInsightsEnabled: true,
        writingPracticeEnabled: true,
        submissionActivityEnabled: true,
        revisionFlowEnabled: true,
        apHistoryEnabled: true,
        collaborativeDraftsEnabled: true,
        studentDocumentSharingEnabled: true,
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

  const assigned = new Set(
    (organization.assignmentTypeAssignments as any[]).map((a) => a.assignmentTypeId)
  );
  const previewSeatMode = client.preview.isIsolatedPreviewSeatMode();
  const serializedOrganization = serializeBaseOrganization(
    organization,
    organization.memberships,
    previewSeatMode,
    client.preview.getConfiguredPreviewOrganizationAccessCode
  );

  const payload = {
    organization: {
      ...serializedOrganization,
      owners: organization.memberships
        .filter((m: any) => m.isOrgOwner && m.isActive !== false)
        .map((m: any) => ({ id: m.id, role: m.role, user: m.user })),
      pendingOwnerInvitations: invitations,
      assignmentTypes: (assignmentTypes as any[]).map((assignmentType) => ({
        ...assignmentType,
        available: assigned.has(assignmentType.id),
      })),
      deleteEligibility: {
        canDelete: totalOrganizations > 1,
        reasons: totalOrganizations <= 1 ? ['Only organization in this environment'] : [],
      },
    },
    previewSeatMode,
    meta: { requestedBy: auth.actorEmail, keyId: auth.keyId },
  };
  await auditInternalAdminOrganizationRead(request, auth, 'organizations.detail.success');
  return response(payload);
}

async function auditInternalAdminOrganizationRead(
  request: Request,
  auth: InternalApiAuthContext,
  result: string
) {
  const url = new URL(request.url);
  const requestHash = createHash('sha256')
    .update(
      [
        request.method.toUpperCase(),
        url.pathname,
        internalApiRawQueryString(url),
      ].join('\n')
    )
    .digest('hex');
  await recordInternalPlatformWriteAudit({
    actorEmail: auth.actorEmail,
    keyId: auth.keyId,
    endpoint: `${request.method.toUpperCase()} ${url.pathname}`,
    requestHash,
    result,
  });
}
