import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { groupDuplicateClassCodes } from './class-code-write.server';

const db = { ...await import('./db.server') };
const scan = mock(async (): Promise<any[]> => []);
const metadata = mock(async (_args: any): Promise<any[]> => []);
const activity = mock(async (..._args: any[]): Promise<any[]> => []);
const readOnly = mock(async () => 0);
const transaction = mock(async (work: any, _options: any) => work({
  class: { findMany: (args: any) => args.where ? metadata(args) : scan() },
  $executeRaw: readOnly, $queryRaw: activity,
}));
mock.module('./db.server', () => ({ ...db, prisma: new Proxy(db.prisma, {
  get(target, property) { return property === '$transaction' ? transaction : Reflect.get(target, property); },
}) }));
const auth = await import('./internal-platform-auth.server');
const { loader, action } = await import('~/routes/api.internal.v1.class-codes.duplicates/route');
const saved = { ...process.env };
const secret = 'duplicate-code-local-unit-test-secret';
const path = 'https://yawp.test/api/internal/v1/class-codes/duplicates';
function request(query = '', method = 'GET', overrides = {}) {
  const url = path + query;
  return new Request(url, { method, headers: auth.signInternalApiRequest({
    url, method, keyId: 'duplicates-test', secret, actor: 'Staff@Example.test', ...overrides,
  }).headers });
}
const call = (req: Request) => loader({ request: req } as any);
const row = (id: string, code: string) => ({ id, code, schoolId: 'school-' + id,
  school: { organizationId: 'org-' + id } });
const detail = (id: string) => ({ id, code: 'stored', title: 'English', schoolId: 'school-' + id,
  school: { name: 'Demo ' + id, organizationId: 'org-' + id, organization: { name: 'Organization ' + id } },
  teachers: [{ user: { email: 'z@example.test' } }, { user: { email: 'a@example.test' } }],
  _count: { students: 24 }, createdAt: new Date('2026-10-16T14:00:00+02:00') });
function dataset(rows: ReturnType<typeof row>[]) {
  scan.mockResolvedValue(rows);
  metadata.mockImplementation(async args => args.where.id.in.map(detail).reverse());
}
beforeEach(() => {
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'duplicates-test', secret, scopes: ['management:read'] }]);
  process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'true';
  process.env.YAWP_MANAGEMENT_SERVICE_KEY = 'b'.repeat(43);
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
  auth.resetInternalApiMemoryNonceStore(); auth.resetInternalApiRateLimitBuckets();
  scan.mockReset().mockResolvedValue([]); metadata.mockReset().mockResolvedValue([]);
  activity.mockReset().mockResolvedValue([]); readOnly.mockClear(); transaction.mockClear();
});
afterEach(() => {
  for (const key of ['YAWP_INTERNAL_API_KEYS', 'LEGACY_INTERNAL_KEY_ALLOWED', 'YAWP_MANAGEMENT_SERVICE_KEY', 'INTERNAL_API_NONCE_STORE']) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});
test('empty read uses repeatable read and database-enforced read-only, with private response', async () => {
  const response = await call(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [], totalCodes: 0, nextCursor: null });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(transaction.mock.calls[0]![1]).toEqual({ isolationLevel: 'RepeatableRead' });
  expect(readOnly).toHaveBeenCalledTimes(1);
  expect(metadata).not.toHaveBeenCalled(); expect(activity).not.toHaveBeenCalled();
});
test('matches report groups, Unicode, whitespace, cross-organization and deterministic class order', async () => {
  const rows = [row('z', ' \tß\n'), row('a', 'ss'), row('b', 'SS'), row('u', 'unique'),
    row('d', '\uFEFFı '), row('c', 'i')];
  dataset(rows);
  activity.mockResolvedValue([{ classId: 'a', lastActivityAt: new Date('2026-10-16T10:00:00-02:00') }]);
  const result = await (await call(request())).json();
  expect(result.items.map((item: any) => ({ code: item.code, count: item.count,
    ids: item.classes.map((c: any) => c.classId) }))).toEqual(groupDuplicateClassCodes(rows)
    .map(g => ({ code: g.code, count: g.count, ids: g.classes.map(c => c.classId) })));
  expect(result.items[1].classes[0]).toEqual({ classId: 'a', className: 'English',
    organizationId: 'org-a', organizationName: 'Organization a', schoolId: 'school-a', schoolName: 'Demo a',
    teacherEmails: ['a@example.test', 'z@example.test'], studentCount: 24,
    createdAt: '2026-10-16T12:00:00.000Z', lastActivityAt: '2026-10-16T12:00:00.000Z' });
  expect(result.items[0].classes[0].lastActivityAt).toBeNull();
  expect(metadata).toHaveBeenCalledTimes(1); expect(activity).toHaveBeenCalledTimes(1);
});
test('null class title falls back to stored code and empty relations stay empty', async () => {
  dataset([row('a', 'x'), row('b', 'X')]);
  metadata.mockResolvedValue(['a', 'b'].map(id => ({ ...detail(id), title: null, teachers: [], _count: { students: 0 } })));
  const result = await (await call(request())).json();
  expect(result.items[0].classes[0]).toMatchObject({ className: 'stored', teacherEmails: [], studentCount: 0, lastActivityAt: null });
});
test('unique codes stay absent, and empty legacy canonical groups can be paged', async () => {
  dataset([row('u', 'unique'), row('v', 'other')]);
  expect(await (await call(request())).json()).toEqual({ items: [], nextCursor: null, totalCodes: 0 });
  dataset([row('a', ''), row('b', '\uFEFF\t'), row('c', 'x'), row('d', 'X')]);
  const first = await (await call(request('?limit=1'))).json();
  expect(first.items[0].code).toBe(''); expect(first.totalCodes).toBe(2);
  const last = await (await call(request('?limit=1&cursor=' + first.nextCursor))).json();
  expect(last.items[0].code).toBe('X'); expect(last.nextCursor).toBeNull();
});
test('canonical prefix and keyset paging keep complete groups, stable totals and no gaps or repeats', async () => {
  dataset(['b', 'a', 'c', 'other'].flatMap(code => [row(code + '2', code), row(code + '1', code.toUpperCase())]));
  let cursor: string | null = null;
  const codes = [];
  do {
    const result = await (await call(request('?limit=1' + (cursor ? '&cursor=' + cursor : '')))).json();
    expect(result.totalCodes).toBe(4); expect(result.items).toHaveLength(1);
    expect(result.items[0].count).toBe(2); expect(result.items[0].classes).toHaveLength(2);
    expect(metadata.mock.lastCall![0].where.id.in).toHaveLength(2);
    codes.push(result.items[0].code); cursor = result.nextCursor;
  } while (cursor);
  expect(codes).toEqual(['A', 'B', 'C', 'OTHER']);
  const filtered = await (await call(request('?q=%20a%20'))).json();
  expect(filtered.totalCodes).toBe(1); expect(filtered.items[0].code).toBe('A');
});
test('default 50 and maximum 200 page groups independently of total', async () => {
  dataset(Array.from({ length: 201 }, (_, i) => String(i).padStart(3, '0')).flatMap(code => [row(code + 'a', code), row(code + 'b', code)]));
  for (const [query, length] of [['', 50], ['?limit=200', 200]] as const) {
    const result = await (await call(request(query))).json();
    expect(result.totalCodes).toBe(201); expect(result.items).toHaveLength(length); expect(result.nextCursor).toBeString();
  }
});
test('strict query and cursor validation happens before class reads', async () => {
  for (const query of ['?limit=0', '?limit=201', '?limit=1.5', '?limit=abc', '?limit=', '?limit=1e2',
    '?cursor=', '?cursor=garbage', '?q=' + 'x'.repeat(201), '?other=1', '?limit=1&limit=2', '?q=a&q=b']) {
    expect((await call(request(query))).status).toBe(400);
  }
  expect(transaction).not.toHaveBeenCalled();
});
test('cursor is canonical base64url, versioned, canonical-code and filter bound', async () => {
  dataset(['ss1', 'ss2'].flatMap(code => [row(code + 'a', code), row(code + 'b', code)]));
  const first = await (await call(request('?q=%C3%9F&limit=1'))).json();
  expect(first.totalCodes).toBe(2);
  expect((await call(request('?q=SS&limit=200&cursor=' + first.nextCursor))).status).toBe(200);
  expect((await call(request('?q=other&cursor=' + first.nextCursor))).status).toBe(400);
  expect((await call(request('?q=SS&cursor=' + first.nextCursor + '='))).status).toBe(400);
  const decoded = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  for (const change of [{ v: 2 }, { code: 2 }, { code: 'lower' }, { extra: 1 }, { binding: 'bad' }]) {
    const cursor = Buffer.from(JSON.stringify({ ...decoded, ...change })).toString('base64url');
    expect((await call(request('?q=SS&cursor=' + cursor))).status).toBe(400);
  }
});
test('missing/invalid signatures, bearer, missing/altered actor and wrong scopes reveal no class data', async () => {
  const cases = [new Request(path), new Request(path, { headers: { authorization: `Bearer ${'b'.repeat(43)}` } })];
  const bad = request(); bad.headers.set(auth.INTERNAL_API_HEADER_SIGNATURE, 'bad'); cases.push(bad);
  const missing = request(); missing.headers.delete(auth.INTERNAL_API_HEADER_ACTOR); cases.push(missing);
  const altered = request(); altered.headers.set(auth.INTERNAL_API_HEADER_ACTOR, 'other@example.test'); cases.push(altered);
  for (const req of cases) {
    const result = await call(req); expect(result.status).toBe(401); expect(await result.json()).toEqual({ error: 'Unauthorized' });
  }
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'duplicates-test', secret, scopes: ['flags:read'] }]);
  expect((await call(request())).status).toBe(403);
  expect(transaction).not.toHaveBeenCalled();
});
test('altered raw query, expired signature, and replay are rejected before data reads', async () => {
  const original = request('?q=a');
  expect((await call(new Request(path + '?q=b', { headers: original.headers }))).status).toBe(401);
  expect((await call(request('', 'GET', { timestamp: String(Math.floor(Date.now() / 1000) - 301) }))).status).toBe(401);
  const replay = request();
  expect((await call(replay.clone())).status).toBe(200);
  expect((await call(replay)).status).toBe(401);
  expect(transaction).toHaveBeenCalledTimes(1);
});
test('unconfigured integration and non-GET methods return no class metadata', async () => {
  expect((await action({ request: request('', 'POST') } as any)).status).toBe(405);
  delete process.env.YAWP_INTERNAL_API_KEYS;
  expect((await call(request())).status).toBe(404);
  expect(transaction).not.toHaveBeenCalled();
});
test('database failure returns a private unavailable response with no partial metadata', async () => {
  scan.mockRejectedValue(new Error('Unavailable'));
  const result = await call(request());
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual({ error: 'Class code report unavailable' });
  expect(result.headers.get('cache-control')).toBe('private, no-store');
});
