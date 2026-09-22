import { createHash, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@app/prisma';
import { z } from 'zod';

export const auditSelect = {
  id: true, sessionId: true, actorId: true, userId: true, organizationId: true,
  action: true, resourceType: true, resourceId: true, requestId: true,
  requestAction: true, jobId: true, createdAt: true,
} as const;
type Event = Prisma.InternalImpersonationEventGetPayload<{ select: typeof auditSelect }>;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const querySchema = z.object({ organizationId: id.optional(), sessionId: id.optional(),
  limit: z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.number().min(1).max(100)).optional(),
  cursor: z.string().max(1000).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
const digest = (value: string) => createHash('sha256').update(value).digest();
const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
});

export function createAuditHandler(
  database: { findMany(query: Prisma.InternalImpersonationEventFindManyArgs): Promise<Event[]> },
  credential: () => string | undefined,
) {
  return async (request: Request) => {
    const key = credential();
    if (!key) return reply({ error: 'Not found' }, 404);
    if (!/^[A-Za-z0-9_-]{43,}$/.test(key)) return reply({ error: 'Integration unavailable' }, 503);
    const supplied = request.headers.get('authorization') || '';
    if (supplied.length > 512 || !timingSafeEqual(digest(supplied), digest(`Bearer ${key}`))) return reply({ error: 'Unauthorized' }, 401);
    if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405);
    let query: Prisma.InternalImpersonationEventFindManyArgs;
    let binding: string, limit: number;
    try {
      const params = new URL(request.url).searchParams;
      for (const name of params.keys()) if (params.getAll(name).length !== 1) throw new Error();
      const parsed = querySchema.parse(Object.fromEntries(params));
      limit = parsed.limit ?? 50;
      binding = digest(JSON.stringify([parsed.organizationId ?? null, parsed.sessionId ?? null])).toString('base64url');
      let after: string | undefined;
      if (parsed.cursor) {
        const cursor = z.object({ id, binding: z.literal(binding) }).strict()
          .parse(JSON.parse(Buffer.from(parsed.cursor, 'base64url').toString()));
        after = cursor.id;
      }
      query = { select: auditSelect, take: limit + 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(after ? { cursor: { id: after }, skip: 1 } : {}), where: {
        ...(parsed.organizationId ? { organizationId: parsed.organizationId } : {}),
        ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}),

      } };
    } catch { return reply({ error: 'Invalid query' }, 400); }
    try {
      const rows = await database.findMany(query);
      const events = rows.slice(0, limit).map(row => Object.fromEntries(Object.keys(auditSelect).map(key => [key, row[key as keyof Event]])));
      const last = rows[Math.min(rows.length, limit) - 1];
      return reply({ events, nextCursor: rows.length > limit && last
        ? Buffer.from(JSON.stringify({ id: last.id, binding })).toString('base64url') : null });
    } catch { return reply({ error: 'Application audit unavailable' }, 503); }
  };
}
