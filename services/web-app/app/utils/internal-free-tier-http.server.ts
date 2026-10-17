import { lockApprovalApplication } from '~/domain/free-tier/approval-lock.server';
import {
  recordFreeTierCapDenialAudit,
  recordTesterAudit,
  type TesterAuditActor,
} from '~/domain/free-tier/tester-audit.server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import {
  authenticateInternalManagementRequest,
  type InternalApiAuthContext,
  INTERNAL_API_HEADER_ACTOR,
  INTERNAL_API_HEADER_KEY_ID,
  INTERNAL_API_HEADER_SIGNATURE,
  recordInternalPlatformWriteAudit,
} from '~/utils/internal-platform-auth.server';
import {
  createAcquisitionTokens,
  getFreeTierReleaseCap,
  listAcquisitionTokensWithStats,
  patchAcquisitionToken,
  releaseBatch,
  releaseBatchSchema,
  setAcquisitionTokenDisabled,
  tokenCreateSchema,
  tokenPatchSchema,
} from '~/domain/free-tier/service.server';
import {
  assertFreeTierBudgetHeadroomForTransition,
  FREE_TIER_BUDGET_ACTIVE_STATUSES,
  FreeTierBudgetExceededError,
  freeTierApplicationConsumesBudget,
  readFreeTierUsageSummary,
} from '~/domain/free-tier/usage-budget.server';
import { readBoundedText } from '~/utils/bounded-body.server';
import {
  ensureFreeTierProductionApprovalHooks,
  getApprovalHooks,
} from '~/domain/free-tier/approval-hooks.server';
import type { FreeTierApplicationStatus } from '@app/prisma';
import { readApprovalHistories, readApprovalEmailLog, persistedApprovalFollowUpFilter } from './internal-approval-history.server';
import { BELOW_HS_TAG } from '~/domain/free-tier/grade-gate';

const response = (value: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(value, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', ...(headers || {}) } });
const digest = (value: string) => createHash('sha256').update(value).digest();
const idempotencyKeySchema = z.string().trim().regex(/^[A-Za-z0-9._:-]{1,200}$/);
const tokenCreateRequestSchema = tokenCreateSchema
  .extend({ createIdempotencyKey: idempotencyKeySchema.nullish() })
  .strict();

function budgetExceededResponse(error: FreeTierBudgetExceededError) {
  return response(
    {
      error: 'Free-tier budget reached',
      operatorMessage: `Free-tier ${error.summary.environment} budget reached: $${error.summary.spendUsd.toFixed(2)} of $${error.summary.budgetUsd.toFixed(2)} used.`,
      usage: error.summary,
    },
    402
  );
}

function auditActorFromInternalRequest(request: Request, action: string): TesterAuditActor {
  const signedActor = request.headers.get(INTERNAL_API_HEADER_ACTOR)?.trim().toLowerCase();
  const signedKeyId = request.headers.get(INTERNAL_API_HEADER_KEY_ID)?.trim();
  return {
    actorUserId: signedKeyId ? `internal-api:${signedKeyId}` : 'internal-api:legacy',
    actorEmail: signedActor || 'legacy@yawp.internal',
    environment: 'internal-api',
    action,
  };
}
/**
 * The management-key check every internal endpoint shares (free tier, feature
 * flags). Returns a response to send back when the request is not allowed.
 */
export async function authenticate(
  request: Request,
  options: { body?: Uint8Array | string } = {}
) {
  const denied = await authenticateInternalManagementRequest(request, options);
  if (denied) return denied;
  return null;
}

export async function authenticateAndAuditWrite(
  request: Request,
  options: { body?: Uint8Array | string } = {}
) {
  const auth = await authenticateAndAuditWriteContext(request, options);
  return auth instanceof Response ? auth : null;
}

async function authenticateAndAuditWriteContext(
  request: Request,
  options: { body?: Uint8Array | string } = {}
): Promise<Response | InternalApiAuthContext> {
  const { authorizeInternalApiRequest } = await import(
    '~/utils/internal-platform-auth.server'
  );
  const auth = await authorizeInternalApiRequest(request, options);
  if (auth instanceof Response) return auth;
  if (request.method !== 'GET' && request.method !== 'HEAD' && auth.mode === 'hmac') {
    const url = new URL(request.url);
    const body = options.body ?? '';
    const hash =
      typeof body === 'string'
        ? createHash('sha256').update(body).digest('hex')
        : createHash('sha256').update(Buffer.from(body)).digest('hex');
    await recordInternalPlatformWriteAudit({
      actorEmail: auth.actorEmail,
      keyId: auth.keyId,
      endpoint: `${request.method} ${url.pathname}`,
      requestHash: hash,
      result: 'authorized',
    });
  }
  return auth;
}

async function authorizeManagement(request: Request) {
  const denied = await authenticate(request);
  if (denied) return denied;
  return null;
}

async function authorizeFreeTierRead(request: Request) {
  const { isFreeTierEnabled } = await import('~/domain/feature-flags/feature-flags.server');
  if (!(await isFreeTierEnabled())) return response({ error: 'Not found' }, 404);
  return authorizeManagement(request);
}

/** #416 release/link/email endpoints only; search/export/queue stay on main behavior. */
async function authorizeFreeTierReleaseManagement(
  request: Request,
  options: { body?: Uint8Array | string } = {}
) {
  const auth = await authorizeFreeTierReleaseManagementAuth(request, options);
  return auth instanceof Response ? auth : null;
}

async function authorizeFreeTierReleaseManagementAuth(
  request: Request,
  options: { body?: Uint8Array | string } = {}
): Promise<Response | InternalApiAuthContext> {
  const { isFreeTierEnabled } = await import('~/domain/feature-flags/feature-flags.server');
  if (!(await isFreeTierEnabled())) {
    return response({ error: 'Not found' }, 404);
  }
  const signed = Boolean(request.headers.get(INTERNAL_API_HEADER_SIGNATURE));
  if (!signed) return response({ error: 'Unauthorized' }, 401);
  return authenticateAndAuditWriteContext(request, options);
}

async function guardFreeTierPost(request: Request, body?: string) {
  const auth = await guardFreeTierPostAuth(request, body);
  return auth instanceof Response ? auth : null;
}

async function guardFreeTierPostAuth(
  request: Request,
  body?: string
): Promise<Response | InternalApiAuthContext | null> {
  const signed = Boolean(request.headers.get(INTERNAL_API_HEADER_SIGNATURE));
  if (body === undefined) {
    const { isFreeTierEnabled } = await import('~/domain/feature-flags/feature-flags.server');
    if (!(await isFreeTierEnabled())) {
      return response({ error: 'Not found' }, 404);
    }
    if (!signed) return response({ error: 'Unauthorized' }, 401);
    return null;
  }
  return authorizeFreeTierReleaseManagementAuth(request, { body });
}

const searchQuery = z
  .object({
    q: z.string().trim().max(200).default(''),
    status: z
      .enum([
        'LEAD',
        'INVITED',
        'ACCOUNT_CREATED',
        'ADMIN_SUBMITTED',
        'SENT',
        'MANUAL_REVIEW',
        'APPROVED',
        'REJECTED',
        'EXPIRED',
      ])
      .optional(),
    released: z.enum(['true', 'false']).optional(),
    acquisitionTokenId: z.string().min(1).max(200).optional(),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export async function applicationsSearch(request: Request) {
  const denied = await authorizeFreeTierRead(request);
  if (denied) return denied;
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  let input: z.infer<typeof searchQuery>;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    input = searchQuery.parse(params);
  } catch {
    return response({ error: 'Invalid query' }, 400);
  }
  // Cursor binding
  const binding = digest(
    JSON.stringify([input.q, input.status ?? null, input.released ?? null, input.acquisitionTokenId ?? null])
  ).toString('base64url');
  let after: string | undefined;
  if (input.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(input.cursor, 'base64url').toString());
      if (!decoded || decoded.binding !== binding || typeof decoded.id !== 'string') throw new Error();
      after = decoded.id;
    } catch {
      return response({ error: 'Invalid cursor' }, 400);
    }
  }
  const where: any = {};
  if (input.status) where.status = input.status;
  if (input.released === 'true') where.releasedAt = { not: null };
  if (input.released === 'false') where.releasedAt = null;
  if (input.acquisitionTokenId) where.acquisitionTokenId = input.acquisitionTokenId;
  if (input.q) {
    where.OR = [
      { email: { contains: input.q, mode: 'insensitive' } },
      { name: { contains: input.q, mode: 'insensitive' } },
      { schoolName: { contains: input.q, mode: 'insensitive' } },
      { location: { contains: input.q, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.freeTierApplication.findMany({
    where,
    orderBy: { id: 'asc' },
    take: input.limit + 1,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      name: true,
      email: true,
      schoolName: true,
      location: true,
      gradeLevel: true,
      acquisitionTokenId: true,
      releasedAt: true,
    },
  });
  const page = rows.slice(0, input.limit);
  const nextCursor =
    rows.length > input.limit
      ? Buffer.from(JSON.stringify({ id: page[page.length - 1]!.id, binding })).toString('base64url')
      : null;
  return response({ applications: page, nextCursor });
}

export async function tokensList(request: Request) {
  const denied = await authorizeFreeTierRead(request);
  if (denied) return denied;
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  const tokens = await listAcquisitionTokensWithStats();
  return response({ tokens });
}

export async function usageSummaryHttp(request: Request) {
  const denied = await authorizeFreeTierRead(request);
  if (denied) return denied;
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  return response({ usage: await readFreeTierUsageSummary() });
}

export async function tokensPatch(request: Request, tokenId: string) {
  if (request.method !== 'PATCH') return response({ error: 'Method not allowed' }, 405);
  const pre = await guardFreeTierPost(request);
  if (pre) return pre;
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return response({ error: 'Invalid content type' }, 400);
  }
  const text = await readBoundedText(request, 32768);
  if (text === null) return response({ error: 'Payload too large' }, 413);
  const post = await guardFreeTierPost(request, text ?? '');
  if (post) return post;
  let parsed: z.infer<typeof tokenPatchSchema>;
  try {
    parsed = tokenPatchSchema.parse(JSON.parse(text));
  } catch {
    return response({ error: 'Invalid input' }, 400);
  }
  try {
    const updated = await patchAcquisitionToken(tokenId, parsed);
    if (!updated) return response({ error: 'Invalid input' }, 400);
    return response({ token: updated });
  } catch {
    return response({ error: 'Not found' }, 404);
  }
}

export async function tokensDisable(request: Request, tokenId: string) {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const pre = await guardFreeTierPost(request);
  if (pre) return pre;
  const post = await guardFreeTierPost(request, '');
  if (post) return post;
  try {
    const updated = await setAcquisitionTokenDisabled(tokenId, true);
    return response({ token: updated });
  } catch {
    return response({ error: 'Not found' }, 404);
  }
}

export async function tokensEnable(request: Request, tokenId: string) {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const pre = await guardFreeTierPost(request);
  if (pre) return pre;
  const post = await guardFreeTierPost(request, '');
  if (post) return post;
  try {
    const updated = await setAcquisitionTokenDisabled(tokenId, false);
    return response({ token: updated });
  } catch {
    return response({ error: 'Not found' }, 404);
  }
}

export async function tokensCreate(request: Request) {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const pre = await guardFreeTierPost(request);
  if (pre) return pre;
  if (new URL(request.url).search) return response({ error: 'Invalid request' }, 400);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response({ error: 'Invalid content type' }, 400);
  const text = await readBoundedText(request, 32768);
  if (text === null) return response({ error: 'Payload too large' }, 413);
  const post = await guardFreeTierPostAuth(request, text ?? '');
  if (post instanceof Response) return post;
  if (!post) return response({ error: 'Unauthorized' }, 401);
  let parsed: z.infer<typeof tokenCreateRequestSchema>;
  try {
    parsed = tokenCreateRequestSchema.parse(JSON.parse(text));
  } catch { return response({ error: 'Invalid input' }, 400); }
  const { createIdempotencyKey, createdBy: _ignoredCreatedBy, ...tokenInput } = parsed;
  const created = await createAcquisitionTokens(
    { ...tokenInput, createdBy: post.actorEmail },
    { idempotencyKey: createIdempotencyKey ?? null }
  );
  return response({ tokens: created });
}

export async function releaseBatchHttp(request: Request) {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const pre = await guardFreeTierPost(request);
  if (pre) return pre;
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response({ error: 'Invalid content type' }, 400);
  const text = await readBoundedText(request, 32768);
  if (text === null) return response({ error: 'Payload too large' }, 413);
  const post = await guardFreeTierPost(request, text ?? '');
  if (post) return post;
  let body: any; try { body = JSON.parse(text); } catch { return response({ error: 'Malformed JSON' }, 400); }
  try {
    const parsed = releaseBatchSchema.parse(body);
    const result = await releaseBatch(parsed, auditActorFromInternalRequest(request, 'waitlist.release'));
    if (result.released > 0) {
      const leads = await prisma.freeTierApplication.findMany({
        where: { id: { in: parsed.applicationIds }, status: 'INVITED' },
        select: { id: true },
      });
      const { sendReleaseEmailsForApplicationIds } = await import('~/domain/free-tier/approval-flow.server');
      const emailResults = await sendReleaseEmailsForApplicationIds(leads.map((l) => l.id));
      const emailFailures = emailResults.filter((r) => !r.ok);
      return response({ ...result, emailFailures, emailFailureCount: emailFailures.length });
    }
    return response(result);
  } catch (error) {
    if (error instanceof FreeTierBudgetExceededError) {
      await recordFreeTierCapDenialAudit(
        prisma,
        auditActorFromInternalRequest(request, 'waitlist.release.denied'),
        null,
        { reason: 'budget_exceeded', budget: error.summary }
      );
      return budgetExceededResponse(error);
    }
    return response({ error: 'Invalid input' }, 400);
  }
}

export async function exportCsv(request: Request) {
  const denied = await authorizeFreeTierRead(request);
  if (denied) return denied;
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  // Validate client filters and pagination using the search contract.
  // Export uses its own row bound below; never inject that bound into search validation.
  let input: z.infer<typeof searchQuery>;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    input = searchQuery.parse(params);
  } catch { return response({ error: 'Invalid query' }, 400); }
  const where: any = {};
  if (input.status) where.status = input.status;
  if (input.released === 'true') where.releasedAt = { not: null };
  if (input.released === 'false') where.releasedAt = null;
  if (input.acquisitionTokenId) where.acquisitionTokenId = input.acquisitionTokenId;
  if (input.q) {
    where.OR = [
      { email: { contains: input.q, mode: 'insensitive' } },
      { name: { contains: input.q, mode: 'insensitive' } },
      { schoolName: { contains: input.q, mode: 'insensitive' } },
      { location: { contains: input.q, mode: 'insensitive' } },
    ];
  }
  // Bounded: one more row than the cap tells us the export was truncated.
  const rows = await prisma.freeTierApplication.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: EXPORT_MAX_ROWS + 1,
    include: { acquisitionToken: { select: { label: true } } },
  });
  const truncated = rows.length > EXPORT_MAX_ROWS;
  if (truncated) rows.length = EXPORT_MAX_ROWS;
  const header = [
    'id',
    'createdAt',
    'status',
    'name',
    'email',
    'schoolName',
    'location',
    'gradeLevel',
    'releasedAt',
    'acquisitionTokenId',
    'acquisitionTokenLabel',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.id,
      r.createdAt.toISOString(),
      r.status,
      csv(r.name),
      csv(r.email),
      csv(r.schoolName),
      csv(r.location),
      csv(r.gradeLevel),
      r.releasedAt ? r.releasedAt.toISOString() : '',
      r.acquisitionTokenId || '',
      csv(r.acquisitionToken?.label ?? ''),
    ].join(','));
  }
  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'content-disposition': 'attachment; filename="free-tier-applications.csv"',
      ...(truncated ? { 'x-export-truncated': 'true' } : {}),
    },
  });
}

export const EXPORT_MAX_ROWS = 10000;

/**
 * Quote for CSV and neutralise spreadsheet formulas: applicants control these
 * fields, and a cell starting with = + - @ (or tab/CR) executes when the file
 * is opened in Excel/Sheets.
 */
export function csv(value: string) {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

// ---------- Approval queue and actions ----------

const operatorEmail = z.string().trim().toLowerCase().email().max(320);
const rejectReason = z.string().trim().min(1).max(2000);

// Every state an operator can act on. SENT = email went to the school admin and
// is still awaiting their response; staff may override (spec 6.5, audited).
const QUEUE_STATUSES = ['ADMIN_SUBMITTED', 'MANUAL_REVIEW', 'SENT'] as const;

const queueQuery = z
  .object({
    q: z.string().trim().max(200).default(''),
    status: z.enum(QUEUE_STATUSES).optional(),
    needsFollowUp: z.enum(['true', 'false']).optional(),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export async function approvalQueue(request: Request) {
  const denied = await authorizeFreeTierRead(request);
  if (denied) return denied;
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  let input: z.infer<typeof queueQuery>;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    input = queueQuery.parse(params);
  } catch {
    return response({ error: 'Invalid query' }, 400);
  }
  const binding = digest(JSON.stringify(input.needsFollowUp === undefined ? [input.q, input.status ?? null] : [input.q, input.status ?? null, input.needsFollowUp])).toString('base64url');
  let after: string | undefined;
  if (input.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(input.cursor, 'base64url').toString());
      if (!decoded || decoded.binding !== binding || typeof decoded.id !== 'string') throw new Error();
      after = decoded.id;
    } catch {
      return response({ error: 'Invalid cursor' }, 400);
    }
  }
  const where: any = { status: input.status ? input.status : { in: [...QUEUE_STATUSES] } };
  if (input.needsFollowUp === 'true') Object.assign(where, persistedApprovalFollowUpFilter());
  if (input.q) {
    where.OR = [
      { email: { contains: input.q, mode: 'insensitive' } },
      { name: { contains: input.q, mode: 'insensitive' } },
      { schoolName: { contains: input.q, mode: 'insensitive' } },
      { location: { contains: input.q, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.freeTierApplication.findMany({
    where,
    orderBy: { id: 'asc' },
    take: input.limit + 1,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      name: true,
      email: true,
      schoolName: true,
      location: true,
      gradeLevel: true,
      acquisitionTokenId: true,
      releasedAt: true,
      approvalDecisions: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, createdAt: true, decision: true, reason: true, decidedByEmail: true },
      },
    },
  });
  const page = rows.slice(0, input.limit);
  const nextCursor =
    rows.length > input.limit ? Buffer.from(JSON.stringify({ id: page[page.length - 1]!.id, binding })).toString('base64url') : null;
  const grouped = await prisma.freeTierApplication.groupBy({
    by: ['status'],
    where: input.needsFollowUp === 'true' ? where : { status: { in: [...QUEUE_STATUSES] } },
    _count: { _all: true },
  });
  const counts: Record<(typeof QUEUE_STATUSES)[number], number> = { ADMIN_SUBMITTED: 0, MANUAL_REVIEW: 0, SENT: 0 };
  for (const g of grouped) counts[g.status as (typeof QUEUE_STATUSES)[number]] = g._count._all;
  const histories = await readApprovalHistories(page.map(row => row.id));
  return response({ applications: page.map(row => ({ ...row, ...histories.get(row.id) })), counts, nextCursor });
}

export async function approvalDetail(request: Request) {
  const denied = await authorizeFreeTierRead(request);
  if (denied) return denied;
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || url.pathname.split('/').filter(Boolean).pop();
  if (!id) return response({ error: 'Missing id' }, 400);
  const row = await prisma.freeTierApplication.findUnique({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      name: true,
      email: true,
      schoolName: true,
      location: true,
      gradeLevel: true,
      acquisitionTokenId: true,
      releasedAt: true,
      approvalDecisions: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, createdAt: true, decision: true, reason: true, decidedByEmail: true },
      },
    },
  });
  if (!row) return response({ error: 'Not found' }, 404);
  const histories = await readApprovalHistories([row.id]);
  const emailLog = await readApprovalEmailLog(row.id);
  return response({ application: { ...row, ...histories.get(row.id), emailLog } });
}

function parseOperatorEmail(request: Request, body?: unknown): string | { error: Response } {
  const fromHeader = request.headers.get('x-yawp-operator-email') ?? request.headers.get('x-operator-email');
  const fromBody = body && typeof body === 'object' && !Array.isArray(body) ? (body as any).decidedByEmail : undefined;
  const candidate = typeof fromHeader === 'string' && fromHeader ? fromHeader : fromBody;
  try {
    return operatorEmail.parse(candidate ?? '');
  } catch {
    return { error: response({ error: 'Invalid operator email' }, 400) };
  }
}

async function enforceHeadroomForActivation(
  tx: any,
  transition: {
    from: { status: FreeTierApplicationStatus; releasedAt?: Date | string | null };
    to: { status: FreeTierApplicationStatus; releasedAt?: Date | string | null };
  }
) {
  const cap = getFreeTierReleaseCap();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_release'))`;
  const wasActive = freeTierApplicationConsumesBudget(transition.from);
  const willBeActive = freeTierApplicationConsumesBudget(transition.to);
  if (!wasActive && willBeActive) {
    const current = await tx.freeTierApplication.count({
      where: {
        OR: [
          { releasedAt: { not: null } },
          { status: { in: FREE_TIER_BUDGET_ACTIVE_STATUSES } },
        ],
      },
    });
    const remaining = Math.max(0, cap - current);
    if (remaining <= 0) return { ok: false as const, reason: 'Release cap reached' };
  }
  try {
    await assertFreeTierBudgetHeadroomForTransition(tx, transition);
  } catch (error) {
    if (error instanceof FreeTierBudgetExceededError) return { ok: false as const, reason: 'Free-tier budget reached', budget: error.summary };
    throw error;
  }
  return { ok: true as const };
}

type HookApp = {
  id: string;
  email: string;
  name: string;
  schoolName: string;
  userId: string | null;
  organizationId: string | null;
};

/**
 * Hooks run after the transaction commits, so a slow or failing hook can never
 * undo a recorded decision or hold row locks. Failures are logged, not thrown:
 * F5 provisioning must be idempotent and retryable from the audit log.
 */
async function runHookSafely(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
  } catch (error) {
    console.error('free_tier_approval_hook_failed', { hook: name, error: error instanceof Error ? error.message : String(error) });
  }
}

async function readActionBody(request: Request, limit: number, requireJson: boolean): Promise<{ body: any; text: string } | { error: Response }> {
  if (requireJson && !request.headers.get('content-type')?.startsWith('application/json')) {
    return { error: response({ error: 'Invalid content type' }, 400) };
  }
  const text = await readBoundedText(request, limit);
  if (text === null) return { error: response({ error: 'Payload too large' }, 413) };
  if (!text) return { body: {}, text: '' };
  if (!request.headers.get('content-type')?.startsWith('application/json')) return { body: {}, text };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: response({ error: 'Invalid input' }, 400) };
    return { body: parsed, text };
  } catch {
    return { error: response({ error: 'Malformed JSON' }, 400) };
  }
}

function actionId(request: Request) {
  // /api/internal/v1/free-tier/approval/:id/<action>
  const id = new URL(request.url).pathname.split('/').filter(Boolean).slice(-2, -1)[0];
  return id ? decodeURIComponent(id) : null;
}

/**
 * One conditional transition: from one of `from` to `to`, with an audit row.
 * Already in `to` returns 200 { idempotent: true } with no new audit row and no
 * hook call, so retries and double-clicks are harmless. A concurrent decision
 * that wins the row first makes the loser's conditional update match zero rows
 * and it gets 409.
 */
async function transition(args: {
  id: string;
  from: FreeTierApplicationStatus[];
  to: FreeTierApplicationStatus;
  decision: 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW';
  decidedByEmail: string;
  reason?: string;
  audit?: TesterAuditActor;
}): Promise<{ status: 200 | 402 | 404 | 409; payload: Record<string, unknown>; app?: HookApp; changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    await lockApprovalApplication(tx, args.id);
    const app = await tx.freeTierApplication.findUnique({
      where: { id: args.id },
      select: {
        id: true,
        status: true,
        email: true,
        name: true,
        schoolName: true,
        userId: true,
        organizationId: true,
        releasedAt: true,
        tags: true,
      },
    });
    if (!app) return { status: 404 as const, payload: { error: 'Not found' }, changed: false };
    if (app.tags?.includes(BELOW_HS_TAG)) return { status: 409 as const, payload: { error: 'grade_gate_declined' }, changed: false };
    if (app.status === args.to) return { status: 200 as const, payload: { ok: true, idempotent: true, status: app.status }, changed: false };
    if (!args.from.includes(app.status)) {
      return { status: 409 as const, payload: { error: 'Illegal state', status: app.status }, changed: false };
    }
    if (args.to === 'APPROVED') {
      const headroom = await enforceHeadroomForActivation(tx, {
        from: { status: app.status, releasedAt: app.releasedAt },
        to: { status: args.to, releasedAt: app.releasedAt },
      });
      if (!headroom.ok) {
        await recordFreeTierCapDenialAudit(
          tx,
          args.audit ?? {
            actorUserId: `operator:${args.decidedByEmail}`,
            actorEmail: args.decidedByEmail,
            environment: 'operator',
            action: 'approval.approve.denied',
          },
          args.id,
          {
            reason: headroom.reason,
            previousStatus: app.status,
            requestedStatus: args.to,
            ...(headroom.budget ? { budget: headroom.budget } : {}),
          }
        );
        return {
          status: headroom.budget ? 402 as const : 409 as const,
          payload: headroom.budget
            ? {
                error: 'Free-tier budget reached',
                operatorMessage: `Free-tier ${headroom.budget.environment} budget reached: $${headroom.budget.spendUsd.toFixed(2)} of $${headroom.budget.budgetUsd.toFixed(2)} used.`,
                usage: headroom.budget,
              }
            : { error: headroom.reason },
          changed: false,
        };
      }
    }
    const updated = await tx.freeTierApplication.updateMany({ where: { id: args.id, status: app.status }, data: { status: args.to } });
    if (updated.count === 0) return { status: 409 as const, payload: { error: 'Conflict' }, changed: false };
    await tx.freeTierApprovalDecision.create({
      data: { applicationId: args.id, decision: args.decision, reason: args.reason ?? null, decidedByEmail: args.decidedByEmail },
    });
    if (args.audit) await recordTesterAudit(tx, args.audit, args.id, { previousStatus: app.status, status: args.to, reason: args.reason ?? null });
    return {
      status: 200 as const,
      payload: { ok: true, status: args.to, previousStatus: app.status },
      app: {
        id: app.id,
        email: app.email,
        name: app.name,
        schoolName: app.schoolName,
        userId: app.userId,
        organizationId: app.organizationId,
      },
      changed: true,
    };
  });
}

// Approval is required before a free account goes live (Bryant, Oct 6). Operators
// approve from the yawp-internal queue, which shows ADMIN_SUBMITTED, MANUAL_REVIEW
// and SENT; each of those is approvable so nothing in the queue is a dead end.
export const APPROVABLE_FROM: FreeTierApplicationStatus[] = ['ADMIN_SUBMITTED', 'MANUAL_REVIEW', 'SENT'];
export const REJECTABLE_FROM: FreeTierApplicationStatus[] = ['ADMIN_SUBMITTED', 'MANUAL_REVIEW', 'SENT'];
export const MANUAL_REVIEW_FROM: FreeTierApplicationStatus[] = ['ADMIN_SUBMITTED', 'SENT'];

export async function approveHttp(request: Request) {
  await ensureFreeTierProductionApprovalHooks();
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const pre = await guardFreeTierPost(request);
  if (pre) return pre;
  const id = actionId(request);
  if (!id) return response({ error: 'Missing id' }, 400);
  const read = await readActionBody(request, 4096, false);
  if ('error' in read) return read.error;
  const post = await guardFreeTierPost(request, read.text);
  if (post) return post;
  const parsedEmail = parseOperatorEmail(request, read.body);
  if (typeof parsedEmail !== 'string') return parsedEmail.error;
  const result = await decideApplication({ id, decision: 'APPROVED', decidedByEmail: parsedEmail });
  return response(result.payload, result.status);
}

export async function rejectHttp(request: Request) {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const pre = await guardFreeTierPost(request);
  if (pre) return pre;
  const id = actionId(request);
  if (!id) return response({ error: 'Missing id' }, 400);
  const read = await readActionBody(request, 4096, true);
  if ('error' in read) return read.error;
  const post = await guardFreeTierPost(request, read.text);
  if (post) return post;
  const parsedEmail = parseOperatorEmail(request, read.body);
  if (typeof parsedEmail !== 'string') return parsedEmail.error;
  let reason: string;
  try {
    reason = rejectReason.parse(read.body.reason);
  } catch {
    return response({ error: 'Reason required' }, 400);
  }
  const result = await decideApplication({ id, decision: 'REJECTED', decidedByEmail: parsedEmail, reason });
  return response(result.payload, result.status);
}

export async function markManualReviewHttp(request: Request) {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const pre = await guardFreeTierPost(request);
  if (pre) return pre;
  const id = actionId(request);
  if (!id) return response({ error: 'Missing id' }, 400);
  const read = await readActionBody(request, 2048, false);
  if ('error' in read) return read.error;
  const post = await guardFreeTierPost(request, read.text);
  if (post) return post;
  const parsedEmail = parseOperatorEmail(request, read.body);
  if (typeof parsedEmail !== 'string') return parsedEmail.error;
  const result = await transition({ id, from: MANUAL_REVIEW_FROM, to: 'MANUAL_REVIEW', decision: 'MANUAL_REVIEW', decidedByEmail: parsedEmail });
  return response(result.payload, result.status);
}

export async function reopenHttp(request: Request) {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const pre = await guardFreeTierPost(request);
  if (pre) return pre;
  const id = actionId(request);
  if (!id) return response({ error: 'Missing id' }, 400);
  const read = await readActionBody(request, 2048, false);
  if ('error' in read) return read.error;
  const post = await guardFreeTierPost(request, read.text);
  if (post) return post;
  const parsedEmail = parseOperatorEmail(request, read.body);
  if (typeof parsedEmail !== 'string') return parsedEmail.error;
  const result = await reopenApplication({ id, decidedByEmail: parsedEmail });
  return response(result.payload, result.status);
}

export async function submitAdminInfoHttp(request: Request) {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const denied = await guardFreeTierPost(request, '');
  if (denied) return denied;
  const id = actionId(request);
  if (!id) return response({ error: 'Missing id' }, 400);
  // No operator email required; this is a flow-step helper.
  const result = await prisma.$transaction(async (tx) => {
    const app = await tx.freeTierApplication.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!app) return { status: 404 as const, payload: { error: 'Not found' } };
    if (app.status === 'ADMIN_SUBMITTED') return { status: 200 as const, payload: { ok: true, idempotent: true } };
    if (app.status !== 'ACCOUNT_CREATED') return { status: 409 as const, payload: { error: 'Illegal state', status: app.status } };
    const updated = await tx.freeTierApplication.updateMany({
      where: { id, status: 'ACCOUNT_CREATED' },
      data: { status: 'ADMIN_SUBMITTED' },
    });
    if (updated.count === 0) return { status: 409 as const, payload: { error: 'Conflict' } };
    return { status: 200 as const, payload: { ok: true } };
  });
  return response(result.payload, result.status);
}

/** Shared operator decisions for signed internal endpoints and scoped platform testers. */
export async function decideApplication(args: {
  id: string;
  decision: 'APPROVED' | 'REJECTED';
  decidedByEmail: string;
  reason?: string;
  audit?: TesterAuditActor;
}) {
  if (args.decision === 'APPROVED') await ensureFreeTierProductionApprovalHooks();
  const result = await transition({ ...args, from: args.decision === 'APPROVED' ? APPROVABLE_FROM : REJECTABLE_FROM, to: args.decision });
  if (result.changed && result.app) {
    const app = result.app;
    if (args.decision === 'APPROVED') {
      await runHookSafely('onApplicationApproved', () => getApprovalHooks().onApplicationApproved(app));
    } else {
      await runHookSafely('onApplicationRejected', () => getApprovalHooks().onApplicationRejected(app, args.reason ?? 'Rejected'));
    }
  }
  return result;
}

export async function reopenApplication(args: { id: string; decidedByEmail: string; audit?: TesterAuditActor }) {
  const { id } = args;
  const result = await prisma.$transaction(async (tx) => {
    await lockApprovalApplication(tx, id);
    const app = await tx.freeTierApplication.findUnique({ where: { id }, select: { id: true, status: true, releasedAt: true, tags: true } });
    if (!app) return { status: 404 as const, payload: { error: 'Not found' } };
    if (app.tags?.includes(BELOW_HS_TAG)) return { status: 409 as const, payload: { error: 'grade_gate_declined' } };
    if (app.status === 'MANUAL_REVIEW') return { status: 200 as const, payload: { ok: true, idempotent: true, status: app.status } };
    if (app.status !== 'REJECTED') return { status: 409 as const, payload: { error: 'Illegal state', status: app.status } };
    // A released application already holds a slot under the F3 cap (released rows
    // count whatever their status), so only unreleased ones need new headroom.
    if (!app.releasedAt) {
      const headroom = await enforceHeadroomForActivation(tx, {
        from: { status: app.status, releasedAt: app.releasedAt },
        to: { status: 'MANUAL_REVIEW', releasedAt: app.releasedAt },
      });
      if (!headroom.ok) {
        await recordFreeTierCapDenialAudit(
          tx,
          args.audit ?? {
            actorUserId: `operator:${args.decidedByEmail}`,
            actorEmail: args.decidedByEmail,
            environment: 'operator',
            action: 'approval.reopen.denied',
          },
          id,
          {
            reason: headroom.reason,
            previousStatus: app.status,
            requestedStatus: 'MANUAL_REVIEW',
            ...(headroom.budget ? { budget: headroom.budget } : {}),
          }
        );
        return {
          status: headroom.budget ? 402 as const : 409 as const,
          payload: headroom.budget
            ? {
                error: 'Free-tier budget reached',
                operatorMessage: `Free-tier ${headroom.budget.environment} budget reached: $${headroom.budget.spendUsd.toFixed(2)} of $${headroom.budget.budgetUsd.toFixed(2)} used.`,
                usage: headroom.budget,
              }
            : { error: headroom.reason },
        };
      }
    }
    const updated = await tx.freeTierApplication.updateMany({ where: { id, status: 'REJECTED' }, data: { status: 'MANUAL_REVIEW' } });
    if (updated.count === 0) return { status: 409 as const, payload: { error: 'Conflict' } };
    await tx.freeTierApprovalDecision.create({ data: { applicationId: id, decision: 'REOPENED', decidedByEmail: args.decidedByEmail } });
    if (args.audit) await recordTesterAudit(tx, args.audit, id, { previousStatus: 'REJECTED', status: 'MANUAL_REVIEW' });
    return { status: 200 as const, payload: { ok: true, status: 'MANUAL_REVIEW', previousStatus: 'REJECTED' } };
  });
  return result;
}
