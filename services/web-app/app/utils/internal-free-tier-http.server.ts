import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { createAcquisitionTokens, getFreeTierReleaseCap, releaseBatch, releaseBatchSchema, tokenCreateSchema } from '~/domain/free-tier/service.server';
import { readBoundedText } from '~/utils/bounded-body.server';
import {
  ensureFreeTierProductionApprovalHooks,
  getApprovalHooks,
} from '~/domain/free-tier/approval-hooks.server';
import type { FreeTierApplicationStatus } from '@app/prisma';

const response = (value: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(value, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', ...(headers || {}) } });
const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * The management-key check every internal endpoint shares (free tier, feature
 * flags). Returns a response to send back when the request is not allowed.
 */
export function authenticate(request: Request) {
  const key = process.env.YAWP_MANAGEMENT_SERVICE_KEY;
  if (!key) return response({ error: 'Not found' }, 404);
  if (!/^[A-Za-z0-9_-]{43,}$/.test(key)) return response({ error: 'Integration unavailable' }, 503);
  const supplied = request.headers.get('authorization') ?? '';
  if (supplied.length > 512 || !timingSafeEqual(digest(supplied), digest(`Bearer ${key}`))) {
    return response({ error: 'Unauthorized' }, 401);
  }
  return null;
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
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export async function applicationsSearch(request: Request) {
  const denied = authenticate(request);
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
  const binding = digest(JSON.stringify([input.q, input.status ?? null, input.released ?? null])).toString('base64url');
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

export async function tokensCreate(request: Request) {
  const denied = authenticate(request);
  if (denied) return denied;
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  if (new URL(request.url).search) return response({ error: 'Invalid request' }, 400);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response({ error: 'Invalid content type' }, 400);
  const text = await readBoundedText(request, 32768);
  if (text === null) return response({ error: 'Payload too large' }, 413);
  let parsed: z.infer<typeof tokenCreateSchema>;
  try {
    parsed = tokenCreateSchema.parse(JSON.parse(text));
  } catch { return response({ error: 'Invalid input' }, 400); }
  const created = await createAcquisitionTokens(parsed);
  return response({ tokens: created });
}

export async function releaseBatchHttp(request: Request) {
  const denied = authenticate(request);
  if (denied) return denied;
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response({ error: 'Invalid content type' }, 400);
  const text = await readBoundedText(request, 32768);
  if (text === null) return response({ error: 'Payload too large' }, 413);
  let body: any; try { body = JSON.parse(text); } catch { return response({ error: 'Malformed JSON' }, 400); }
  try {
    const result = await releaseBatch(releaseBatchSchema.parse(body));
    return response(result);
  } catch { return response({ error: 'Invalid input' }, 400); }
}

export async function exportCsv(request: Request) {
  const denied = authenticate(request);
  if (denied) return denied;
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  // Reuse search filter parsing
  let input: z.infer<typeof searchQuery>;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    input = searchQuery.parse({ ...params, limit: '1000' });
  } catch { return response({ error: 'Invalid query' }, 400); }
  const where: any = {};
  if (input.status) where.status = input.status;
  if (input.released === 'true') where.releasedAt = { not: null };
  if (input.released === 'false') where.releasedAt = null;
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
  });
  const truncated = rows.length > EXPORT_MAX_ROWS;
  if (truncated) rows.length = EXPORT_MAX_ROWS;
  const header = ['id', 'createdAt', 'status', 'name', 'email', 'schoolName', 'location', 'gradeLevel', 'releasedAt', 'acquisitionTokenId'];
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
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export async function approvalQueue(request: Request) {
  const denied = authenticate(request);
  if (denied) return denied;
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  let input: z.infer<typeof queueQuery>;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    input = queueQuery.parse(params);
  } catch {
    return response({ error: 'Invalid query' }, 400);
  }
  const binding = digest(JSON.stringify([input.q, input.status ?? null])).toString('base64url');
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
    where: { status: { in: [...QUEUE_STATUSES] } },
    _count: { _all: true },
  });
  const counts: Record<(typeof QUEUE_STATUSES)[number], number> = { ADMIN_SUBMITTED: 0, MANUAL_REVIEW: 0, SENT: 0 };
  for (const g of grouped) counts[g.status as (typeof QUEUE_STATUSES)[number]] = g._count._all;
  return response({ applications: page, counts, nextCursor });
}

export async function approvalDetail(request: Request) {
  const denied = authenticate(request);
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
  return response({ application: row });
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

const ACTIVE_STATUSES: FreeTierApplicationStatus[] = [
  'INVITED',
  'ACCOUNT_CREATED',
  'ADMIN_SUBMITTED',
  'SENT',
  'MANUAL_REVIEW',
  'APPROVED',
];

async function enforceHeadroomForActivation(tx: any) {
  const cap = getFreeTierReleaseCap();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_release'))`;
  const current = await tx.freeTierApplication.count({
    where: { OR: [{ releasedAt: { not: null } }, { status: { in: ACTIVE_STATUSES } }] },
  });
  const remaining = Math.max(0, cap - current);
  return remaining > 0;
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

async function readActionBody(request: Request, limit: number, requireJson: boolean): Promise<{ body: any } | { error: Response }> {
  if (requireJson && !request.headers.get('content-type')?.startsWith('application/json')) {
    return { error: response({ error: 'Invalid content type' }, 400) };
  }
  const text = await readBoundedText(request, limit);
  if (text === null) return { error: response({ error: 'Payload too large' }, 413) };
  if (!text) return { body: {} };
  if (!request.headers.get('content-type')?.startsWith('application/json')) return { body: {} };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: response({ error: 'Invalid input' }, 400) };
    return { body: parsed };
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
}): Promise<{ status: 200 | 404 | 409; payload: Record<string, unknown>; app?: HookApp; changed: boolean }> {
  return prisma.$transaction(async (tx) => {
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
      },
    });
    if (!app) return { status: 404 as const, payload: { error: 'Not found' }, changed: false };
    if (app.status === args.to) return { status: 200 as const, payload: { ok: true, idempotent: true, status: app.status }, changed: false };
    if (!args.from.includes(app.status)) {
      return { status: 409 as const, payload: { error: 'Illegal state', status: app.status }, changed: false };
    }
    const updated = await tx.freeTierApplication.updateMany({ where: { id: args.id, status: app.status }, data: { status: args.to } });
    if (updated.count === 0) return { status: 409 as const, payload: { error: 'Conflict' }, changed: false };
    await tx.freeTierApprovalDecision.create({
      data: { applicationId: args.id, decision: args.decision, reason: args.reason ?? null, decidedByEmail: args.decidedByEmail },
    });
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
  ensureFreeTierProductionApprovalHooks();
  const denied = authenticate(request);
  if (denied) return denied;
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const id = actionId(request);
  if (!id) return response({ error: 'Missing id' }, 400);
  const read = await readActionBody(request, 4096, false);
  if ('error' in read) return read.error;
  const parsedEmail = parseOperatorEmail(request, read.body);
  if (typeof parsedEmail !== 'string') return parsedEmail.error;
  const result = await transition({ id, from: APPROVABLE_FROM, to: 'APPROVED', decision: 'APPROVED', decidedByEmail: parsedEmail });
  if (result.changed && result.app) {
    const app = result.app;
    await runHookSafely('onApplicationApproved', () => getApprovalHooks().onApplicationApproved(app));
  }
  return response(result.payload, result.status);
}

export async function rejectHttp(request: Request) {
  const denied = authenticate(request);
  if (denied) return denied;
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const id = actionId(request);
  if (!id) return response({ error: 'Missing id' }, 400);
  const read = await readActionBody(request, 4096, true);
  if ('error' in read) return read.error;
  const parsedEmail = parseOperatorEmail(request, read.body);
  if (typeof parsedEmail !== 'string') return parsedEmail.error;
  let reason: string;
  try {
    reason = rejectReason.parse(read.body.reason);
  } catch {
    return response({ error: 'Reason required' }, 400);
  }
  const result = await transition({ id, from: REJECTABLE_FROM, to: 'REJECTED', decision: 'REJECTED', decidedByEmail: parsedEmail, reason });
  if (result.changed && result.app) {
    const app = result.app;
    await runHookSafely('onApplicationRejected', () => getApprovalHooks().onApplicationRejected(app, reason));
  }
  return response(result.payload, result.status);
}

export async function markManualReviewHttp(request: Request) {
  const denied = authenticate(request);
  if (denied) return denied;
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const id = actionId(request);
  if (!id) return response({ error: 'Missing id' }, 400);
  const read = await readActionBody(request, 2048, false);
  if ('error' in read) return read.error;
  const parsedEmail = parseOperatorEmail(request, read.body);
  if (typeof parsedEmail !== 'string') return parsedEmail.error;
  const result = await transition({ id, from: MANUAL_REVIEW_FROM, to: 'MANUAL_REVIEW', decision: 'MANUAL_REVIEW', decidedByEmail: parsedEmail });
  return response(result.payload, result.status);
}

export async function reopenHttp(request: Request) {
  const denied = authenticate(request);
  if (denied) return denied;
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const id = actionId(request);
  if (!id) return response({ error: 'Missing id' }, 400);
  const read = await readActionBody(request, 2048, false);
  if ('error' in read) return read.error;
  const parsedEmail = parseOperatorEmail(request, read.body);
  if (typeof parsedEmail !== 'string') return parsedEmail.error;
  const result = await prisma.$transaction(async (tx) => {
    const app = await tx.freeTierApplication.findUnique({ where: { id }, select: { id: true, status: true, releasedAt: true } });
    if (!app) return { status: 404 as const, payload: { error: 'Not found' } };
    if (app.status === 'MANUAL_REVIEW') return { status: 200 as const, payload: { ok: true, idempotent: true, status: app.status } };
    if (app.status !== 'REJECTED') return { status: 409 as const, payload: { error: 'Illegal state', status: app.status } };
    // A released application already holds a slot under the F3 cap (released rows
    // count whatever their status), so only unreleased ones need new headroom.
    if (!app.releasedAt) {
      const hasRoom = await enforceHeadroomForActivation(tx);
      if (!hasRoom) return { status: 409 as const, payload: { error: 'Release cap reached' } };
    }
    const updated = await tx.freeTierApplication.updateMany({ where: { id, status: 'REJECTED' }, data: { status: 'MANUAL_REVIEW' } });
    if (updated.count === 0) return { status: 409 as const, payload: { error: 'Conflict' } };
    await tx.freeTierApprovalDecision.create({ data: { applicationId: id, decision: 'REOPENED', decidedByEmail: parsedEmail } });
    return { status: 200 as const, payload: { ok: true, status: 'MANUAL_REVIEW', previousStatus: 'REJECTED' } };
  });
  return response(result.payload, result.status);
}

export async function submitAdminInfoHttp(request: Request) {
  const denied = authenticate(request);
  if (denied) return denied;
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
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
