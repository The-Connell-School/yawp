import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@app/prisma';
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const inputSchema = z.object({ q: z.string().trim().max(200).default(''), organizationIds: z.array(identifier).min(1).max(100).optional(), cursor: z.string().max(500).optional(), limit: z.number().int().min(1).max(50).default(50) }).strict();
const digest = (value: string) => createHash('sha256').update(value).digest();
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
export function createOrganizationManagementHandler(directory: { findMany(args: Prisma.OrganizationFindManyArgs): Promise<{ id: string; name: string }[]> }, credential: () => string | undefined) {
  return async (request: Request) => {
    const key = credential();
    if (!key) return response({ error: 'Not found' }, 404);
    if (!/^[A-Za-z0-9_-]{43,}$/.test(key)) return response({ error: 'Integration unavailable' }, 503);
    const supplied = request.headers.get('authorization') ?? '';
    if (supplied.length > 512 || !timingSafeEqual(digest(supplied), digest(`Bearer ${key}`))) return response({ error: 'Unauthorized' }, 401);
    if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
    let input: z.infer<typeof inputSchema>, after: string | undefined, binding: string;
    try {
      if (new URL(request.url).search || !request.headers.get('content-type')?.startsWith('application/json')) throw new Error();
      const reader = request.body?.getReader(); if (!reader) throw new Error();
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 32768) { await reader.cancel(); throw new Error(); } chunks.push(part.value); } } finally { reader.releaseLock(); }
      input = inputSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (input.organizationIds) input.organizationIds = [...new Set(input.organizationIds)].sort();
      binding = digest(JSON.stringify([input.q, input.organizationIds ?? null])).toString('base64url');
      if (input.cursor) {
        if (!/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw new Error();
        const cursor = z.object({ id: identifier, binding: z.string() }).strict().parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString()));
        if (cursor.binding !== binding) throw new Error(); after = cursor.id;
      }
    } catch { return response({ error: 'Invalid organization query' }, 400); }
    try {
      const rows = await directory.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' }, take: input.limit + 1,
        where: { id: { ...(input.organizationIds ? { in: input.organizationIds } : {}), ...(after ? { gt: after } : {}) }, ...(input.q ? { name: { contains: input.q, mode: 'insensitive' } } : {}) } });
      const page = rows.slice(0, input.limit);
      return response({ organizations: page.map(({ id, name }) => ({ id, name })), nextCursor: rows.length > input.limit ? Buffer.from(JSON.stringify({ id: page[page.length - 1]!.id, binding })).toString('base64url') : null });
    } catch { return response({ error: 'Organization directory unavailable' }, 503); }
  };
}

/**
 * Every organization as `{ id, name }`, sorted by name, for pickers in the
 * internal app (feature-flag targeting). Same management-key bearer auth as
 * the search endpoint; one unpaginated read of two columns.
 */
export function createOrganizationListHandler(directory: { findMany(args: Prisma.OrganizationFindManyArgs): Promise<{ id: string; name: string }[]> }, credential: () => string | undefined) {
  return async (request: Request) => {
    const key = credential();
    if (!key) return response({ error: 'Not found' }, 404);
    if (!/^[A-Za-z0-9_-]{43,}$/.test(key)) return response({ error: 'Integration unavailable' }, 503);
    const supplied = request.headers.get('authorization') ?? '';
    if (supplied.length > 512 || !timingSafeEqual(digest(supplied), digest(`Bearer ${key}`))) return response({ error: 'Unauthorized' }, 401);
    if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
    try {
      const rows = await directory.findMany({ select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
      return response({ organizations: rows.map(({ id, name }) => ({ id, name })) });
    } catch { return response({ error: 'Organization directory unavailable' }, 503); }
  };
}
