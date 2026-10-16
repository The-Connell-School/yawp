import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@app/prisma';
import {
  authorizeInternalApiRequest,
  parseInternalApiKeysFromEnv,
  recordInternalPlatformWriteAudit,
  type InternalApiAuthContext,
} from './internal-platform-auth.server';

const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const filter = z.string().trim().max(320).default('');
const date = z
  .string()
  .max(40)
  .refine((value) => {
    if (!value) return true;
    if (
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
        value
      )
    )
      return false;
    const parsed = new Date(value);
    return (
      Number.isFinite(parsed.getTime()) &&
      new Date(value.slice(0, 10)).toISOString().slice(0, 10) ===
        value.slice(0, 10)
    );
  }, 'Invalid date')
  .default('');
const querySchema = z
  .object({
    userOrEmail: filter,
    documentId: filter,
    submissionId: filter,
    feature: filter,
    kind: filter,
    requestId: filter,
    startAt: date,
    endAt: date,
    limit: z
      .string()
      .regex(/^\d{1,3}$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .default('25'),
    cursor: z
      .string()
      .max(1000)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();
const cursorSchema = z
  .object({
    id: idSchema,
    createdAt: z.string().datetime(),
    binding: z.string(),
  })
  .strict();

// Replay URLs can contain credentials. Redact every nested occurrence as well.
export function stripReplayUrl(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripReplayUrl);
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value)
    .filter(([key]) => key !== 'replayUrl')
    .map(([key, item]) => [key, stripReplayUrl(item)]);
  return entries.length ? Object.fromEntries(entries) : null;
}
function truncateText(value: string | null, maxLength = 220) {
  if (!value) return null;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string
): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function metadataNumber(
  metadata: Record<string, unknown>,
  key: string
): number | null {
  const value = metadata[key];
  return typeof value === 'number' ? value : null;
}

export const writeSelect = {
  id: true,
  createdAt: true,
  eventType: true,
  source: true,
  requestId: true,
  traceId: true,
  sessionId: true,
  editorSessionId: true,
  documentId: true,
  userId: true,
  membershipId: true,
  status: true,
  failureReason: true,
  clientSeq: true,
  baseRevision: true,
  resultingRevision: true,
  title: true,
  text: true,
  metadata: true,
} satisfies Prisma.DocumentWriteJournalSelect;
export const aiSelect = {
  id: true,
  createdAt: true,
  model: true,
  provider: true,
  inputTokens: true,
  outputTokens: true,
  totalTokens: true,
  durationMs: true,
  systemPrompt: true,
  messages: true,
  response: true,
  error: true,
  metadata: true,
} satisfies Prisma.LlmLogSelect;

type Write = Prisma.DocumentWriteJournalGetPayload<{
  select: typeof writeSelect;
}>;
type Ai = Prisma.LlmLogGetPayload<{ select: typeof aiSelect }>;
export function shapeWrite(entry: Write) {
  return {
    id: entry.id,
    createdAt: entry.createdAt.toISOString(),
    eventType: entry.eventType,
    writeSource: entry.source,
    requestId: entry.requestId,
    traceId: entry.traceId,
    sessionId: entry.sessionId,
    editorSessionId: entry.editorSessionId,
    documentId: entry.documentId,
    userId: entry.userId,
    membershipId: entry.membershipId,
    success:
      entry.status === 'accepted'
        ? true
        : entry.status === 'rejected'
          ? false
          : null,
    status: entry.status,
    failureReason: entry.failureReason,
    clientSeq: entry.clientSeq,
    baseRevision: entry.baseRevision,
    resultingRevision: entry.resultingRevision,
    title: entry.title,
    textPreview: truncateText(entry.text),
    metadata: stripReplayUrl(entry.metadata),
  };
}
export function shapeAi(entry: Ai) {
  const metadata = metadataRecord(entry.metadata);
  return {
    id: entry.id,
    createdAt: entry.createdAt.toISOString(),
    model: entry.model,
    provider: entry.provider,
    feature: metadataString(metadata, 'feature'),
    kind: metadataString(metadata, 'kind'),
    documentSource: metadataString(metadata, 'documentSource'),
    documentId: metadataString(metadata, 'documentId'),
    submissionId: metadataString(metadata, 'submissionId'),
    documentTextLength: metadataNumber(metadata, 'documentTextLength'),
    documentTextSha256: metadataString(metadata, 'documentTextSha256'),
    assignmentTypeId: metadataString(metadata, 'assignmentTypeId'),
    assignmentTypeRubricSource: metadataString(
      metadata,
      'assignmentTypeRubricSource'
    ),
    assignmentTypeGradingVersion: metadataNumber(
      metadata,
      'assignmentTypeGradingVersion'
    ),
    rubricCategoryKeys: stripReplayUrl(metadata.rubricCategoryKeys) ?? null,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    totalTokens: entry.totalTokens,
    durationMs: entry.durationMs,
    systemPrompt: entry.systemPrompt,
    messages: entry.messages,
    response: entry.response,
    error: entry.error,
    metadata: stripReplayUrl(entry.metadata),
  };
}

type Database = {
  documentWriteJournal: {
    findMany(args: Prisma.DocumentWriteJournalFindManyArgs): Promise<Write[]>;
    findUnique(
      args: Prisma.DocumentWriteJournalFindUniqueArgs
    ): Promise<{ metadata: unknown } | null>;
  };
  llmLog: { findMany(args: Prisma.LlmLogFindManyArgs): Promise<Ai[]> };
  user: { findMany(args: Prisma.UserFindManyArgs): Promise<{ id: string }[]> };
  orgMembership: {
    findMany(args: Prisma.OrgMembershipFindManyArgs): Promise<{ id: string }[]>;
  };
};
type AuditRead = typeof recordInternalPlatformWriteAudit;
async function authenticate(request: Request) {
  if (!parseInternalApiKeysFromEnv().length)
    return reply({ error: 'Not found' }, 404);
  if (request.method !== 'GET')
    return reply({ error: 'Method not allowed' }, 405);
  if (
    request.body !== null ||
    request.headers.has('transfer-encoding') ||
    (request.headers.has('content-length') &&
      request.headers.get('content-length') !== '0')
  )
    return reply({ error: 'GET requires an empty body' }, 400);
  if (!request.headers.has('x-yawp-signature'))
    return reply({ error: 'Signed staff request required' }, 401);
  const auth = await authorizeInternalApiRequest(request, {
    body: '',
    requiredScope: 'audit:read',
  });
  if (auth instanceof Response) return auth;
  if (
    auth.mode !== 'hmac' ||
    ['system@yawp.internal', 'system@yawp.school'].includes(auth.actorEmail) ||
    auth.actorEmail === 'legacy@yawp.internal'
  )
    return reply({ error: 'Staff operator required' }, 403);
  return auth;
}
async function recordRead(
  request: Request,
  auth: InternalApiAuthContext,
  audit: AuditRead,
  result: string
) {
  const url = new URL(request.url);
  await audit({
    actorEmail: auth.actorEmail,
    keyId: auth.keyId,
    endpoint: `GET ${url.pathname}`,
    requestHash: createHash('sha256')
      .update(`GET\n${url.pathname}\n${url.search.slice(1)}`)
      .digest('hex'),
    result,
  });
}
export function createAdminAuditHandlers({
  db,
  auditRead = recordInternalPlatformWriteAudit,
}: {
  db: Database;
  auditRead?: AuditRead;
}) {
  async function list(request: Request, kind: 'document-writes' | 'ai-logs') {
    const auth = await authenticate(request);
    if (auth instanceof Response) return auth;
    let query: z.infer<typeof querySchema>,
      binding: string,
      after: z.infer<typeof cursorSchema> | undefined;
    try {
      const params = new URL(request.url).searchParams;
      for (const name of params.keys())
        if (params.getAll(name).length !== 1) throw new Error();
      query = querySchema.parse(Object.fromEntries(params));
      if (
        query.startAt &&
        query.endAt &&
        new Date(query.startAt) > new Date(query.endAt)
      )
        throw new Error();
      const { cursor, limit, ...filters } = query;
      binding = createHash('sha256')
        .update(JSON.stringify([kind, filters]))
        .digest('hex');
      if (cursor) {
        after = cursorSchema.parse(
          JSON.parse(Buffer.from(cursor, 'base64url').toString())
        );
        if (after.binding !== binding) throw new Error();
      }
    } catch {
      return reply(
        { error: 'Invalid Audit filters, date range, limit or cursor' },
        400
      );
    }
    const createdAt =
      query.startAt || query.endAt
        ? {
            ...(query.startAt ? { gte: new Date(query.startAt) } : {}),
            ...(query.endAt ? { lte: new Date(query.endAt) } : {}),
          }
        : undefined;
    // Resolve the cursor timestamp inside PostgreSQL to retain timestamptz(6) precision.
    const paging = after ? { cursor: { id: after.id }, skip: 1 } : {};
    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    try {
      let rows: (Write | Ai)[];
      if (kind === 'document-writes') {
        const users = query.userOrEmail
          ? await db.user.findMany({
              where: {
                OR: [
                  { id: query.userOrEmail },
                  {
                    email: { contains: query.userOrEmail, mode: 'insensitive' },
                  },
                  {
                    name: { contains: query.userOrEmail, mode: 'insensitive' },
                  },
                ],
              },
              select: { id: true },
              take: 100,
            })
          : [];
        const memberships = users.length
          ? await db.orgMembership.findMany({
              where: { userId: { in: users.map((u) => u.id) } },
              select: { id: true },
              take: 300,
            })
          : [];
        rows = await db.documentWriteJournal.findMany({
          where: {
            AND: [
              {
                ...(createdAt ? { createdAt } : {}),
                ...(query.documentId ? { documentId: query.documentId } : {}),
                ...(query.requestId ? { requestId: query.requestId } : {}),
                ...(query.userOrEmail
                  ? {
                      OR: [
                        { userId: query.userOrEmail },
                        { membershipId: query.userOrEmail },
                        { userId: { in: users.map((u) => u.id) } },
                        { membershipId: { in: memberships.map((m) => m.id) } },
                      ],
                    }
                  : {}),
              },
            ],
          },
          ...paging,
          orderBy,
          take: query.limit + 1,
          select: writeSelect,
        });
      } else {
        const filters: Prisma.LlmLogWhereInput[] = [];
        for (const key of [
          'documentId',
          'submissionId',
          'feature',
          'kind',
        ] as const)
          if (query[key])
            filters.push({ metadata: { path: [key], equals: query[key] } });
        rows = await db.llmLog.findMany({
          where: { AND: [...(createdAt ? [{ createdAt }] : []), ...filters] },
          ...paging,
          orderBy,
          take: query.limit + 1,
          select: aiSelect,
        });
      }
      const page = rows.slice(0, query.limit),
        last = page.at(-1);
      const nextCursor =
        rows.length > query.limit && last
          ? Buffer.from(
              JSON.stringify({
                id: last.id,
                createdAt: last.createdAt.toISOString(),
                binding,
              })
            ).toString('base64url')
          : null;
      await recordRead(request, auth, auditRead, `audit.${kind}.success`);
      return reply({
        entries:
          kind === 'document-writes'
            ? (page as Write[]).map(shapeWrite)
            : (page as Ai[]).map(shapeAi),
        nextCursor,
      });
    } catch {
      return reply({ error: 'Audit timeline unavailable. Try again.' }, 503);
    }
  }
  return {
    writes: (request: Request) => list(request, 'document-writes'),
    ai: (request: Request) => list(request, 'ai-logs'),
    async detail(request: Request, id: string | undefined) {
      const auth = await authenticate(request);
      if (auth instanceof Response) return auth;
      if (!idSchema.safeParse(id).success || new URL(request.url).search)
        return reply({ error: 'Invalid document-write detail request' }, 400);
      try {
        const row = await db.documentWriteJournal.findUnique({
          where: { id },
          select: { metadata: true },
        });
        if (!row) return reply({ error: 'Document write not found' }, 404);
        await recordRead(
          request,
          auth,
          auditRead,
          'audit.document-write-detail.success'
        );
        return reply({ detail: { metadata: stripReplayUrl(row.metadata) } });
      } catch {
        return reply({ error: 'Audit detail unavailable. Try again.' }, 503);
      }
    },
  };
}
