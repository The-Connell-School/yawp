import { createHash, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@app/prisma';

const select = {
  id: true, organizationId: true,
  user: { select: { id: true, name: true, email: true, isAdmin: true, isSuperAdmin: true } },
} as const;
type Membership = Prisma.OrgMembershipGetPayload<{ select: typeof select }>;
type Directory = { findMany(args: Prisma.OrgMembershipFindManyArgs): Promise<Membership[]> };
const identifier = /^[a-zA-Z0-9_-]{1,128}$/;
const response = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
});
const digest = (value: string) => createHash('sha256').update(value).digest();

export function createUserManagementHandlers(directory: Directory, credential: () => string | undefined) {
  function authenticate(request: Request) {
    const key = credential();
    if (!key) return response({ error: 'Not found' }, 404);
    if (!/^[A-Za-z0-9_-]{43,}$/.test(key)) return response({ error: 'Integration unavailable' }, 503);
    const supplied = request.headers.get('authorization') || '';
    if (supplied.length > 512 || !timingSafeEqual(digest(supplied), digest(`Bearer ${key}`))) {
      return response({ error: 'Unauthorized' }, 401);
    }
    if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
    return null;
  }

  function parse(request: Request, allowed: string[]) {
    const params = new URL(request.url).searchParams;
    for (const key of params.keys()) {
      if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new Error('Invalid query');
    }
    const organizationId = params.get('organizationId') || undefined;
    if (organizationId && !identifier.test(organizationId)) throw new Error('Invalid organization');
    return { params, organizationId };
  }

  return {
    async search(request: Request) {
      const denied = authenticate(request);
      if (denied) return denied;
      let query: Prisma.OrgMembershipFindManyArgs;
      let binding: string;
      let limit: number;
      try {
        const { params, organizationId } = parse(request, ['q', 'organizationId', 'cursor', 'limit']);
        const q = (params.get('q') || '').trim();
        if (q.length > 200) throw new Error('Query too long');
        const rawLimit = params.get('limit') || '50';
        if (!/^\d{1,2}$/.test(rawLimit)) throw new Error('Invalid limit');
        limit = Number(rawLimit);
        if (limit < 1 || limit > 50) throw new Error('Invalid limit');
        binding = digest(JSON.stringify([q, organizationId || null])).toString('base64url');
        const cursor = params.get('cursor');
        let after: string | undefined;
        if (cursor) {
          if (cursor.length > 500 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid cursor');
          const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
          if (decoded.binding !== binding || typeof decoded.id !== 'string' || !identifier.test(decoded.id)) throw new Error('Invalid cursor');
          after = decoded.id;
        }
        query = {
          select, take: limit + 1, orderBy: { id: 'asc' },
          where: {
            isActive: true, ...(organizationId ? { organizationId } : {}),
            ...(after ? { id: { gt: after } } : {}),
            ...(q ? { user: { OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ] } } : {}),
          },
        };
      } catch { return response({ error: 'Invalid query' }, 400); }
      try {
        const rows = await directory.findMany(query);
        const page = rows.slice(0, limit);
        return response({
          users: page.map(({ organizationId, user }) => ({
            id: user.id, organizationId, displayName: user.name || user.email,
            email: user.email, privileged: user.isAdmin || user.isSuperAdmin,
          })),
          nextCursor: rows.length > limit
            ? Buffer.from(JSON.stringify({ id: page[page.length - 1]!.id, binding })).toString('base64url') : null,
        });
      } catch { return response({ error: 'User directory unavailable' }, 503); }
    },
    async lookup(request: Request, userId: string | undefined) {
      const denied = authenticate(request);
      if (denied) return denied;
      let organizationId: string | undefined;
      try {
        ({ organizationId } = parse(request, ['organizationId']));
        if (!userId || !identifier.test(userId)) throw new Error('Invalid user');
      } catch { return response({ error: 'Invalid query' }, 400); }
      try {
        const rows = await directory.findMany({
          select, take: 2,
          where: { userId, isActive: true, ...(organizationId ? { organizationId } : {}) },
        });
        if (!rows.length) return response({ error: 'User not found' }, 404);
        if (rows.length !== 1) return response({ error: 'Select an organization' }, 409);
        const { user, organizationId: org } = rows[0]!;
        return response({ id: user.id, organizationId: org, privileged: user.isAdmin || user.isSuperAdmin });
      } catch { return response({ error: 'User directory unavailable' }, 503); }
    },
  };
}
