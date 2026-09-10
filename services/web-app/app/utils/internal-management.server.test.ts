import { describe, expect, mock, test } from 'bun:test';
import { createUserManagementHandlers } from './internal-management.server';

const key = 'a'.repeat(43);
const row = (id = 'membership-1', organizationId = 'org-1') => ({
  id, organizationId, user: { id: 'user-1', name: 'QA Teacher', email: 'qa@example.test', isAdmin: false, isSuperAdmin: false },
});
const request = (query = '', credential = key) => new Request(`https://yawp.test/api/internal/v1/users${query}`, {
  headers: { authorization: `Bearer ${credential}` },
});
function fixture(secret: string | null = key) {
  const findMany = mock(async (_args: unknown) => [row()]);
  const handlers = createUserManagementHandlers({ findMany }, () => secret ?? undefined);
  return { ...handlers, findMany };
}

describe('internal user management boundary', () => {
  test('disabled or invalid machine authentication never queries users', async () => {
    for (const secret of [null, key]) {
      const handler = fixture(secret);
      const response = await handler.search(request('', 'wrong'));
      expect(response.status).toBe(secret ? 401 : 404);
      expect(handler.findMany).not.toHaveBeenCalled();
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  test('filters active memberships by organization before bounded pagination', async () => {
    const handler = fixture();
    const response = await handler.search(request('?q=Teacher&organizationId=org-1&limit=1'));
    expect(response.status).toBe(200);
    expect(handler.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { isActive: true, organizationId: 'org-1', user: { OR: [
        { email: { contains: 'Teacher', mode: 'insensitive' } },
        { name: { contains: 'Teacher', mode: 'insensitive' } },
      ] } }, take: 2, orderBy: { id: 'asc' },
    });
    expect(await response.json()).toEqual({ users: [{ id: 'user-1', organizationId: 'org-1', displayName: 'QA Teacher', email: 'qa@example.test', privileged: false }], nextCursor: null });
  });

  test('classifies both administrator flags and returns a bounded continuation', async () => {
    const handler = fixture();
    handler.findMany.mockResolvedValue([
      { ...row(), user: { ...row().user, isSuperAdmin: true } }, row('membership-2'),
    ]);
    const result = await (await handler.search(request('?limit=1'))).json();
    expect(result.users).toHaveLength(1);
    expect(result.users[0].privileged).toBe(true);
    expect(result.nextCursor).toBeTruthy();
    await handler.search(request(`?limit=1&cursor=${encodeURIComponent(result.nextCursor)}`));
    expect(handler.findMany.mock.calls[1]?.[0]).toMatchObject({ where: { id: { gt: 'membership-1' } } });
    const invalidScope = await handler.search(request(`?limit=1&organizationId=other&cursor=${encodeURIComponent(result.nextCursor)}`));
    expect(invalidScope.status).toBe(400);
  });

  test('rejects malformed query and oversized limits without database access', async () => {
    for (const query of ['?limit=51', '?limit=0', '?limit=abc', '?cursor=bogus', '?unknown=x', '?q=a&q=b']) {
      const handler = fixture();
      expect((await handler.search(request(query))).status).toBe(400);
      expect(handler.findMany).not.toHaveBeenCalled();
    }
  });

  test('lookup refuses ambiguous organization membership and supports explicit selection', async () => {
    const handler = fixture();
    handler.findMany.mockResolvedValue([row(), row('membership-2', 'org-2')]);
    expect((await handler.lookup(request(), 'user-1')).status).toBe(409);
    handler.findMany.mockResolvedValue([row()]);
    const response = await handler.lookup(request('?organizationId=org-1'), 'user-1');
    expect(await response.json()).toEqual({ id: 'user-1', organizationId: 'org-1', privileged: false });
    expect(handler.findMany.mock.calls[1]?.[0]).toMatchObject({ where: { userId: 'user-1', organizationId: 'org-1', isActive: true } });
    handler.findMany.mockResolvedValue([]);
    expect((await handler.lookup(request(), 'missing')).status).toBe(404);
  });

  test('database failures return no query, user details or credentials', async () => {
    const handler = fixture();
    handler.findMany.mockRejectedValue(new Error(`sensitive ${key}`));
    const response = await handler.search(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"error":"User directory unavailable"}');
  });
});

import { createOrganizationManagementHandler } from './internal-organizations.server';
test('organization search authenticates, binds pagination to scope and returns only directory fields', async () => {
  const calls: any[] = [];
  const handler = createOrganizationManagementHandler({ findMany: async (args: any) => { calls.push(args); return [{ id: 'org-a', name: 'Alpha' }, { id: 'org-b', name: 'Beta' }]; } }, () => key);
  const make = (body: any, token = key) => new Request('https://yawp.test/api/internal/v1/organizations/search', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  expect((await handler(make({}, 'bad'))).status).toBe(401); expect(calls).toHaveLength(0);
  const first = await handler(make({ q: 'School', organizationIds: ['org-a', 'org-b'], limit: 1 }));
  expect(first.headers.get('cache-control')).toBe('no-store');
  const page = await first.json(); expect(page.organizations).toEqual([{ id: 'org-a', name: 'Alpha' }]);
  expect(calls[0]).toMatchObject({ select: { id: true, name: true }, take: 2, where: { id: { in: ['org-a', 'org-b'] }, name: { contains: 'School', mode: 'insensitive' } } });
  expect((await handler(make({ q: 'School', organizationIds: ['org-a'], cursor: page.nextCursor }))).status).toBe(400);
  expect((await handler(make({ q: 'School', organizationIds: ['org-b', 'org-a'], cursor: page.nextCursor }))).status).toBe(200);
  expect(calls[1].where.id.gt).toBe('org-a');
  expect((await handler(make({ organizationIds: [] }))).status).toBe(400);
  expect((await handler(make({ actorId: 'spoof' }))).status).toBe(400);
});
