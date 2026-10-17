import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@app/prisma';
import { BELOW_HS_TAG } from '~/domain/free-tier/grade-gate';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import { prisma } from './db.server';
import { authorizeInternalApiRequest, INTERNAL_API_HEADER_SIGNATURE } from './internal-platform-auth.server';

const response = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
});

// Dates mean midnight UTC; timestamps must specify UTC or an explicit offset.
const isoDate = z.union([z.string().date(), z.string().datetime({ offset: true })])
  .transform(value => new Date(value));
const querySchema = z.object({
  q: z.string().trim().max(200).default(''),
  from: isoDate.optional(), to: isoDate.optional(),
  cursor: z.string().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict().refine(input => !input.from || !input.to || input.from <= input.to);
const cursorSchema = z.object({
  v: z.literal(1), binding: z.string(), id: z.string().min(1).max(200),
}).strict();

export async function gradeGateDeclines(request: Request): Promise<Response> {
  // Same base feature gate and management scope as free-tier reads. This new
  // endpoint requires a signed staff identity and never falls back to bearer.
  if (!(await isFreeTierEnabled())) return response({ error: 'Not found' }, 404);
  if (!request.headers.get(INTERNAL_API_HEADER_SIGNATURE)) return response({ error: 'Unauthorized' }, 401);
  const auth = await authorizeInternalApiRequest(request, { requiredScope: 'management:read' });
  if (auth instanceof Response) return auth;
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);

  let input: z.infer<typeof querySchema>;
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new Error();
    input = querySchema.parse(Object.fromEntries(params));
  } catch { return response({ error: 'Invalid query' }, 400); }
  const binding = createHash('sha256').update(JSON.stringify([
    input.q, input.from?.toISOString() ?? null, input.to?.toISOString() ?? null,
  ])).digest('base64url');
  let after: string | undefined;
  if (input.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw new Error();
      const bytes = Buffer.from(input.cursor, 'base64url');
      if (bytes.toString('base64url') !== input.cursor) throw new Error();
      const cursor = cursorSchema.parse(JSON.parse(bytes.toString('utf8')));
      if (cursor.binding !== binding) throw new Error();
      after = cursor.id;
    } catch { return response({ error: 'Invalid cursor' }, 400); }
  }
  const where: Prisma.FreeTierApplicationWhereInput = { tags: { has: BELOW_HS_TAG } };
  if (input.from || input.to) where.createdAt = {
    ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}),
  };
  if (input.q) where.OR = ['name', 'email', 'schoolName'].map(field => ({
    [field]: { contains: input.q, mode: 'insensitive' },
  }));
  // ID order is stable even for equal or sub-millisecond createdAt values.
  // A keyset predicate also survives deletion of a preceding page's last row.
  const { rows, total } = await prisma.$transaction(async tx => ({
    rows: await tx.freeTierApplication.findMany({
      where: { ...where, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: 'asc' }, take: input.limit + 1,
      select: { id: true, createdAt: true, name: true, email: true, schoolName: true,
        location: true, gradeLevel: true, tags: true, acquisitionTokenId: true,
        acquisitionToken: { select: { label: true } } },
    }),
    total: await tx.freeTierApplication.count({ where }),
  }), { isolationLevel: 'RepeatableRead' });
  const page = rows.slice(0, input.limit);
  const nextCursor = rows.length > input.limit
    ? Buffer.from(JSON.stringify({ v: 1, binding, id: page[page.length - 1]!.id })).toString('base64url') : null;
  return response({ items: page.map(({ acquisitionToken, ...row }) => ({
    ...row, createdAt: row.createdAt.toISOString(), acquisitionTokenLabel: acquisitionToken?.label ?? null,
  })), nextCursor, total });
}
