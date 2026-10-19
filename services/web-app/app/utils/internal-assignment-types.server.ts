import { createHash } from 'node:crypto';
import type { Prisma } from '@app/prisma';
import {
  authorizeInternalApiRequest,
  internalApiRawQueryString,
  type InternalApiAuthContext,
} from '~/utils/internal-platform-auth.server';

const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });

export const identifier = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_LIMIT = 100;

const listSelect = {
  id: true,
  title: true,
  kind: true,
  systemKey: true,
  description: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  scoringScaleJson: true,
  rubricJson: true,
  image: { select: { id: true, altText: true, contentType: true } },
  rubric: {
    select: {
      id: true,
      name: true,
      title: true,
      currentRevisionId: true,
      currentRevision: { select: { id: true, version: true, fingerprint: true, createdAt: true } },
    },
  },
  rubricBaseline: {
    select: {
      rubricRevisionId: true,
      rubricRevision: { select: { id: true, rubricName: true, version: true, fingerprint: true, createdAt: true } },
    },
  },
  assignmentModules: {
    where: { deletedAt: null },
    select: { id: true },
  },
  _count: { select: { organizationAssignments: true } },
} satisfies Prisma.AssignmentTypeSelect;

export const detailSelect = {
  ...listSelect,
  tutorInstructions: true,
  allowsImageUploads: true,
  collaborationSupported: true,
  scoringScaleJson: true,
  rubricJson: true,
  gradingPromptConfigJson: true,
  gradingOutputSchemaJson: true,
  gradingCalibrationNotes: true,
  gradingAssistantVersion: true,
  assignmentModules: {
    where: { deletedAt: null },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      description: true,
      position: true,
      isSelfGuided: true,
      deletedAt: true,
      instructions: {
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          title: true,
          position: true,
          showChatButton: true,
          showNextButton: true,
          _count: { select: { buttons: true } },
        },
      },
    },
  },
  organizationAssignments: {
    orderBy: { organization: { name: 'asc' } },
    select: {
      organizationId: true,
      createdAt: true,
      organization: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.AssignmentTypeSelect;

export type AssignmentTypeListRow = Prisma.AssignmentTypeGetPayload<{ select: typeof listSelect }>;
export type AssignmentTypeDetailRow = Prisma.AssignmentTypeGetPayload<{ select: typeof detailSelect }>;

export type AssignmentTypeDb = {
  assignmentType: {
    findMany(args: Prisma.AssignmentTypeFindManyArgs): Promise<unknown[]>;
    findUnique(args: Prisma.AssignmentTypeFindUniqueArgs): Promise<unknown | null>;
  };
  rubricRelease: {
    findMany(args: Prisma.RubricReleaseFindManyArgs): Promise<unknown[]>;
  };
};

type AssignmentTypeReleaseRow = {
  catalogKey: string;
  releasedAt: Date;
  rubricRevision: { id: string; version: number; fingerprint: string };
};

export type AssignmentTypeReadAudit = (input: {
  actorEmail: string;
  keyId: string;
  endpoint: string;
  requestHash: string;
  result: string;
}) => Promise<void>;

type Authenticate = (request: Request) => Promise<Response | InternalApiAuthContext>;

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function parseLimit(value: string | null) {
  if (!value) return 50;
  if (!/^\d{1,3}$/.test(value)) throw new Error('Invalid limit');
  const limit = Number(value);
  if (limit < 1 || limit > MAX_LIMIT) throw new Error('Invalid limit');
  return limit;
}

function parseArchived(value: string | null): 'active' | 'archived' | 'all' {
  if (!value) return 'active';
  if (value === 'active' || value === 'archived' || value === 'all') return value;
  throw new Error('Invalid archived filter');
}

type AssignmentTypeCursor = { id: string; createdAt: Date };

function decodeCursor(value: string | null, binding: string): AssignmentTypeCursor | undefined {
  if (!value) return undefined;
  if (value.length > 500 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid cursor');
  const decoded = JSON.parse(Buffer.from(value, 'base64url').toString()) as { id?: unknown; createdAt?: unknown; binding?: unknown };
  if (
    decoded.binding !== binding ||
    typeof decoded.id !== 'string' ||
    !identifier.test(decoded.id) ||
    typeof decoded.createdAt !== 'string'
  ) {
    throw new Error('Invalid cursor');
  }
  const createdAtMs = Date.parse(decoded.createdAt);
  if (!Number.isFinite(createdAtMs)) throw new Error('Invalid cursor');
  return { id: decoded.id, createdAt: new Date(createdAtMs) };
}

function nextCursor(page: { id: string; createdAt: Date | string }[], hasMore: boolean, binding: string) {
  if (!hasMore) return null;
  const last = page.at(-1);
  return last ? Buffer.from(JSON.stringify({ id: last.id, createdAt: iso(last.createdAt), binding })).toString('base64url') : null;
}

export function releaseKey(row: { id: string; rubric: { name: string } | null; rubricBaseline: unknown | null }) {
  if (row.rubric?.name) return row.rubric.name;
  return row.rubricBaseline ? `assignment-type:${row.id}` : null;
}

function mapRelease(release: AssignmentTypeReleaseRow | undefined) {
  if (!release) return null;
  return {
    catalogKey: release.catalogKey,
    revisionId: release.rubricRevision.id,
    version: release.rubricRevision.version,
    fingerprint: release.rubricRevision.fingerprint,
    releasedAt: iso(release.releasedAt),
  };
}

function mapRow(row: AssignmentTypeListRow, releases: Map<string, AssignmentTypeReleaseRow>) {
  const key = releaseKey(row);
  const source = row.rubric ? 'library' : row.rubricBaseline ? 'assignment-type' : row.rubricJson || row.scoringScaleJson ? 'assignment-type' : 'built-in';
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    systemKey: row.systemKey,
    description: row.description,
    archived: Boolean(row.archivedAt),
    archivedAt: iso(row.archivedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    image: row.image ? { id: row.image.id, altText: row.image.altText, contentType: row.image.contentType } : null,
    counts: {
      modules: row.assignmentModules.length,
      organizations: row._count.organizationAssignments,
    },
    rubricReference: {
      source,
      catalogKey: key,
      library: row.rubric
        ? {
            id: row.rubric.id,
            name: row.rubric.name,
            title: row.rubric.title,
            currentRevisionId: row.rubric.currentRevisionId,
            currentRevision: row.rubric.currentRevision
              ? {
                  id: row.rubric.currentRevision.id,
                  version: row.rubric.currentRevision.version,
                  fingerprint: row.rubric.currentRevision.fingerprint,
                  createdAt: iso(row.rubric.currentRevision.createdAt),
                }
              : null,
          }
        : null,
      baseline: row.rubricBaseline?.rubricRevision
        ? {
            revisionId: row.rubricBaseline.rubricRevision.id,
            rubricName: row.rubricBaseline.rubricRevision.rubricName,
            version: row.rubricBaseline.rubricRevision.version,
            fingerprint: row.rubricBaseline.rubricRevision.fingerprint,
            createdAt: iso(row.rubricBaseline.rubricRevision.createdAt),
          }
        : null,
      release: key ? mapRelease(releases.get(key)) : null,
    },
  };
}

export function mapDetail(row: AssignmentTypeDetailRow, releases: Map<string, AssignmentTypeReleaseRow>) {
  return {
    ...mapRow(row, releases),
    tutorInstructions: row.tutorInstructions,
    allowsImageUploads: row.allowsImageUploads,
    collaborationSupported: row.collaborationSupported,
    gradingAssistantVersion: row.gradingAssistantVersion,
    grading: {
      hasScoringScale: row.scoringScaleJson !== null,
      hasOwnRubric: row.rubricJson !== null,
      hasPromptConfig: row.gradingPromptConfigJson !== null,
      hasOutputSchema: row.gradingOutputSchemaJson !== null,
      hasCalibrationNotes: Boolean(row.gradingCalibrationNotes),
    },
    modules: row.assignmentModules.map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      position: module.position,
      isSelfGuided: module.isSelfGuided,
      instructionCount: module.instructions.length,
      instructions: module.instructions.map((instruction) => ({
        id: instruction.id,
        title: instruction.title,
        position: instruction.position,
        showChatButton: instruction.showChatButton,
        showNextButton: instruction.showNextButton,
        buttonCount: instruction._count.buttons,
      })),
    })),
    organizations: row.organizationAssignments.map((assignment) => ({
      id: assignment.organization.id,
      name: assignment.organization.name,
      assignedAt: iso(assignment.createdAt),
    })),
  };
}

async function authenticateSigned(request: Request, authenticate: Authenticate) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  if (auth.mode !== 'hmac') return response({ error: 'Unauthorized' }, 401);
  return auth;
}

async function auditRead(request: Request, auth: InternalApiAuthContext, audit: AssignmentTypeReadAudit | undefined, result: string) {
  if (!audit) return;
  const url = new URL(request.url);
  const requestHash = createHash('sha256')
    .update([request.method.toUpperCase(), url.pathname, internalApiRawQueryString(url)].join('\n'))
    .digest('hex');
  await audit({
    actorEmail: auth.actorEmail,
    keyId: auth.keyId,
    endpoint: `${request.method.toUpperCase()} ${url.pathname}`,
    requestHash,
    result,
  });
}

export async function releasesFor(db: AssignmentTypeDb, keys: (string | null)[]) {
  const catalogKeys = [...new Set(keys.filter((key): key is string => Boolean(key)))];
  if (!catalogKeys.length) return new Map<string, AssignmentTypeReleaseRow>();
  const releases = await db.rubricRelease.findMany({
    where: { catalogKey: { in: catalogKeys } },
    select: {
      catalogKey: true,
      releasedAt: true,
      rubricRevision: { select: { id: true, version: true, fingerprint: true } },
    },
  }) as AssignmentTypeReleaseRow[];
  return new Map<string, AssignmentTypeReleaseRow>(releases.map((release) => [release.catalogKey, release]));
}

export function createInternalAssignmentTypeHandlers(input: {
  db: AssignmentTypeDb;
  authenticate?: Authenticate;
  auditRead?: AssignmentTypeReadAudit;
}) {
  const authenticate = input.authenticate ?? ((request) => authorizeInternalApiRequest(request, { requiredScope: 'management:read' }));
  return {
    async list(request: Request) {
      const auth = await authenticateSigned(request, authenticate);
      if (auth instanceof Response) return auth;
      if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
      let limit: number;
      let q: string;
      let archived: 'active' | 'archived' | 'all';
      let after: AssignmentTypeCursor | undefined;
      let binding: string;
      try {
        const params = new URL(request.url).searchParams;
        for (const key of params.keys()) {
          if (!['q', 'archived', 'cursor', 'limit'].includes(key) || params.getAll(key).length !== 1) {
            throw new Error('Invalid query');
          }
        }
        limit = parseLimit(params.get('limit'));
        q = (params.get('q') ?? '').trim();
        if (q.length > 120) throw new Error('Invalid query');
        archived = parseArchived(params.get('archived'));
        binding = createHash('sha256').update(JSON.stringify([q, archived])).digest('base64url');
        after = decodeCursor(params.get('cursor'), binding);
      } catch {
        return response({ error: 'Invalid query' }, 400);
      }
      const whereClauses: Prisma.AssignmentTypeWhereInput[] = [];
      if (after) {
        whereClauses.push({
          OR: [
            { createdAt: { lt: after.createdAt } },
            { createdAt: after.createdAt, id: { lt: after.id } },
          ],
        });
      }
      if (archived === 'active') whereClauses.push({ archivedAt: null });
      if (archived === 'archived') whereClauses.push({ archivedAt: { not: null } });
      if (q) {
        whereClauses.push({
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { kind: { contains: q, mode: 'insensitive' } },
            { systemKey: { contains: q, mode: 'insensitive' } },
          ],
        });
      }

      const rows = await input.db.assignmentType.findMany({
        select: listSelect,
        take: limit + 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: whereClauses.length > 0 ? { AND: whereClauses } : {},
      }) as AssignmentTypeListRow[];
      const page = rows.slice(0, limit);
      const releases = await releasesFor(input.db, page.map(releaseKey));
      await auditRead(request, auth, input.auditRead, 'assignment-types.list.success');
      return response({
        assignmentTypes: page.map((row) => mapRow(row, releases)),
        nextCursor: nextCursor(page, rows.length > limit, binding),
      });
    },
    async detail(request: Request, id: string | undefined) {
      const auth = await authenticateSigned(request, authenticate);
      if (auth instanceof Response) return auth;
      if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
      if (!id || !identifier.test(id)) return response({ error: 'Invalid assignment type' }, 400);
      const row = await input.db.assignmentType.findUnique({
        where: { id },
        select: detailSelect,
      }) as AssignmentTypeDetailRow | null;
      if (!row) return response({ error: 'Assignment type not found' }, 404);
      const releases = await releasesFor(input.db, [releaseKey(row)]);
      await auditRead(request, auth, input.auditRead, 'assignment-types.detail.success');
      return response({ assignmentType: mapDetail(row, releases) });
    },
  };
}
