import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { createAcquisitionTokens, releaseBatch, tokenCreateSchema } from '~/domain/free-tier/service.server';

const response = (value: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(value, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', ...(headers || {}) } });
const digest = (value: string) => createHash('sha256').update(value).digest();

function authenticate(request: Request) {
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
  const reader = request.body?.getReader(); if (!reader) return response({ error: 'Invalid request' }, 400);
  let text = '';
  try {
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 32768) throw new Error();
      text += Buffer.from(part.value).toString('utf8');
    }
  } catch {
    return response({ error: 'Payload too large' }, 413);
  } finally { reader.releaseLock(); }
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
  const text = await request.text();
  if (text.length > 32768) return response({ error: 'Payload too large' }, 413);
  let body: any; try { body = JSON.parse(text); } catch { return response({ error: 'Malformed JSON' }, 400); }
  try {
    const result = await releaseBatch(z.object({ applicationIds: z.array(z.string().min(1).max(200)).min(1).max(1000) }).strict().parse(body));
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
  const rows = await prisma.freeTierApplication.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
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
    },
  });
}

function csv(value: string) {
  const v = value ?? '';
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

