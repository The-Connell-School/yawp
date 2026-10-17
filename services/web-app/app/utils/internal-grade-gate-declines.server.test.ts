import { afterEach, beforeEach, expect, mock, test } from 'bun:test';

const flags = { ...await import('~/domain/feature-flags/feature-flags.server') };
const enabled = mock(async () => true);
const v2Enabled = mock(async () => false);
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ ...flags,
  isFreeTierEnabled: enabled, isFeatureFlagEnabled: v2Enabled,
}));
const db = { ...await import('~/utils/db.server') };
const reads = mock(async (_args: any): Promise<any[]> => []);
const count = mock(async (_args: any) => 0);
const transaction = mock(async (work: any) => work({ freeTierApplication: { findMany: reads, count } }));
mock.module('~/utils/db.server', () => ({ ...db, prisma: new Proxy(db.prisma, {
  get(target, property) { return property === '$transaction' ? transaction : Reflect.get(target, property); },
}) }));
const auth = await import('./internal-platform-auth.server');
const { loader } = await import('~/routes/api.internal.v1.free-tier.grade-gate-declines/route');
const saved = { ...process.env };
const secret = 'grade-decline-local-unit-test-secret';
const path = 'https://yawp.test/api/internal/v1/free-tier/grade-gate-declines';
function request(query = '', method = 'GET') {
  const url = path + query;
  return new Request(url, { method, headers: auth.signInternalApiRequest({
    url, method, keyId: 'grade-test', secret, actor: 'Staff@Example.test',
  }).headers });
}
const call = (req: Request) => loader({ request: req } as any);
const row = (id: string) => ({ id, createdAt: new Date('2026-10-16T12:00:00Z'),
  name: 'Teacher', email: 'teacher@example.test', schoolName: 'Demo', location: 'Here',
  gradeLevel: '7', tags: ['below-hs'], acquisitionTokenId: null, acquisitionToken: null });

beforeEach(() => {
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'grade-test', secret, scopes: ['management:read'] }]);
  process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'true';
  process.env.YAWP_MANAGEMENT_SERVICE_KEY = 'b'.repeat(43);
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
  auth.resetInternalApiMemoryNonceStore(); auth.resetInternalApiRateLimitBuckets();
  reads.mockReset().mockResolvedValue([]); count.mockReset().mockResolvedValue(0);
  transaction.mockClear(); enabled.mockReset().mockResolvedValue(true); v2Enabled.mockClear();
});
afterEach(() => {
  for (const key of ['YAWP_INTERNAL_API_KEYS', 'LEGACY_INTERNAL_KEY_ALLOWED', 'YAWP_MANAGEMENT_SERVICE_KEY', 'INTERNAL_API_NONCE_STORE']) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});

test('signed empty read works with v2 off, no-store, and the default limit', async () => {
  const result = await call(request());
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ items: [], nextCursor: null, total: 0 });
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(reads.mock.calls[0]![0].take).toBe(51);
  expect(v2Enabled).not.toHaveBeenCalled();
});
test('denied signed requests and legacy bearer never read applications', async () => {
  const cases = [new Request(path), new Request(path, { headers: { authorization: `Bearer ${'b'.repeat(43)}` } })];
  const invalid = request(); invalid.headers.set(auth.INTERNAL_API_HEADER_SIGNATURE, 'bad'); cases.push(invalid);
  const noActor = request(); noActor.headers.delete(auth.INTERNAL_API_HEADER_ACTOR); cases.push(noActor);
  for (const req of cases) expect((await call(req)).status).toBe(401);
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'grade-test', secret, scopes: ['flags:read'] }]);
  expect((await call(request())).status).toBe(403);
  expect(transaction).not.toHaveBeenCalled(); expect(reads).not.toHaveBeenCalled(); expect(count).not.toHaveBeenCalled();
});
test('staff identity is part of the verified signature', async () => {
  const req = request(); req.headers.set(auth.INTERNAL_API_HEADER_ACTOR, 'other@example.test');
  expect((await call(req)).status).toBe(401);
  expect(transaction).not.toHaveBeenCalled();
});
test('base free-tier access and GET method are required', async () => {
  enabled.mockResolvedValue(false);
  expect((await call(request())).status).toBe(404);
  enabled.mockResolvedValue(true);
  expect((await call(request('', 'POST'))).status).toBe(405);
  expect(transaction).not.toHaveBeenCalled();
});
test('strict validation rejects malformed, duplicate and unsupported parameters', async () => {
  for (const query of ['?limit=0', '?limit=201', '?limit=1.5', '?limit=abc', '?from=no',
    '?from=2026-02-30', '?to=2026-10-10&from=2026-10-11', '?from=2026-10-10T12:00:00',
    '?cursor=', '?cursor=garbage', '?q=' + 'x'.repeat(201), '?other=1', '?limit=1&limit=2']) {
    expect((await call(request(query))).status).toBe(400);
  }
  expect(transaction).not.toHaveBeenCalled();
});
test('tag, text and inclusive date filters also apply to total before pagination', async () => {
  const result = await call(request('?q=%20teacher%20&from=2026-10-15&to=2026-10-16T15:00:00%2B02:00&limit=200'));
  expect(result.status).toBe(200);
  const args = reads.mock.calls[0]![0];
  expect(args.take).toBe(201);
  expect(args.where).toEqual({ tags: { has: 'below-hs' }, createdAt: {
    gte: new Date('2026-10-15T00:00:00Z'), lte: new Date('2026-10-16T13:00:00Z'),
  }, OR: ['name', 'email', 'schoolName'].map(key => ({ [key]: { contains: 'teacher', mode: 'insensitive' } })) });
  expect(count).toHaveBeenCalledWith({ where: args.where });
});
test('UTC contract, nullable token context and stable equal-time cursor', async () => {
  reads.mockResolvedValue([row('a'), { ...row('b'), acquisitionTokenId: 'token', acquisitionToken: { label: 'Event' } }, row('c')]);
  count.mockResolvedValue(3);
  const first = await (await call(request('?limit=2'))).json();
  expect(first.total).toBe(3); expect(first.items).toHaveLength(2);
  expect(first.items[0]).toEqual({ ...row('a'), createdAt: '2026-10-16T12:00:00.000Z', acquisitionToken: undefined, acquisitionTokenLabel: null });
  expect(first.items[1].acquisitionTokenLabel).toBe('Event');
  reads.mockResolvedValue([row('c')]);
  const next = await (await call(request('?limit=2&cursor=' + first.nextCursor))).json();
  expect(next.nextCursor).toBeNull(); expect(next.total).toBe(3);
  expect(reads.mock.calls[1]![0].where.id).toEqual({ gt: 'b' });
  expect(count.mock.calls[1]![0]).toEqual({ where: { tags: { has: 'below-hs' } } });
  expect((await call(request('?q=changed&cursor=' + first.nextCursor))).status).toBe(400);
});
test('cursor structure, version and canonical encoding are validated', async () => {
  for (const position of [{ v: 1, id: '' }, { v: 2, id: 'a' }, { v: 1, id: 123 }]) {
    const binding = (await import('node:crypto')).createHash('sha256').update(JSON.stringify(['', null, null])).digest('base64url');
    const cursor = Buffer.from(JSON.stringify({ binding, ...position })).toString('base64url');
    expect((await call(request('?cursor=' + cursor))).status).toBe(400);
  }
});
