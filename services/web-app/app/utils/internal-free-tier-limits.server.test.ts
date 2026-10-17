import { afterEach, beforeEach, expect, mock, test } from 'bun:test';

const flags = { ...await import('~/domain/feature-flags/feature-flags.server') };
const enabled = mock(async () => true);
const v2 = mock(async () => true);
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  ...flags, isFreeTierEnabled: enabled, isFeatureFlagEnabled: v2,
}));
const db = { ...await import('~/utils/db.server') };
let row: { value: string } | null = null;
const findUnique = mock(async () => row);
const createMany = mock(async ({ data }: any) => {
  if (row) return { count: 0 };
  row = { value: data.value }; return { count: 1 };
});
const updateMany = mock(async ({ where, data }: any) => {
  if (!row || row.value !== where.value) return { count: 0 };
  row = { value: data.value }; return { count: 1 };
});
const audit = mock(async () => ({}));
mock.module('~/utils/db.server', () => ({ ...db, prisma: new Proxy(db.prisma, {
  get(target, property) {
    if (property === 'setting') return { findUnique, createMany, updateMany };
    if (property === 'internalPlatformApiAudit') return { create: audit };
    return Reflect.get(target, property);
  },
}) }));
const auth = await import('./internal-platform-auth.server');
const { loader, action } = await import('~/routes/api.internal.v1.free-tier.limits/route');
const saved = { ...process.env };
const secret = 'local-limits-unit-test-secret-32-characters';
const url = 'https://yawp.test/api/internal/v1/free-tier/limits';
const defaults = { studentSeatCap: 35, lessonPlannerMonthly: 5, reporterMonthly: 2,
  updatedAt: null, updatedByEmail: null, version: 0,
  bounds: { studentSeatCap: [1, 200], lessonPlannerMonthly: [0, 100], reporterMonthly: [0, 100] } };
function request(method = 'GET', body?: unknown, signedBody?: string) {
  const text = body === undefined ? undefined : JSON.stringify(body);
  return new Request(url, { method, body: text, headers: {
    ...auth.signInternalApiRequest({ url, method, keyId: 'limits-test', secret,
      actor: 'Staff@Example.test', body: signedBody ?? text ?? '' }).headers,
    'content-type': 'application/json',
  } });
}
const call = (req: Request) => (req.method === 'GET' ? loader : action)({ request: req } as any);
beforeEach(() => {
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'limits-test', secret, scopes: ['management:read', 'management:write'] }]);
  process.env.YAWP_MANAGEMENT_SERVICE_KEY = 'b'.repeat(43);
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
  auth.resetInternalApiMemoryNonceStore(); auth.resetInternalApiRateLimitBuckets();
  row = null; enabled.mockReset().mockResolvedValue(true); v2.mockReset().mockResolvedValue(true);
  for (const fn of [findUnique, createMany, updateMany, audit]) fn.mockClear();
});
afterEach(() => {
  for (const key of ['YAWP_INTERNAL_API_KEYS', 'YAWP_MANAGEMENT_SERVICE_KEY', 'INTERNAL_API_NONCE_STORE']) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});
test('default GET serializes the exact contract with v2 off and does not initialize storage', async () => {
  v2.mockResolvedValue(false);
  const result = await call(request());
  expect(result.status).toBe(200); expect(await result.json()).toEqual(defaults);
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(createMany).not.toHaveBeenCalled(); expect(v2).not.toHaveBeenCalled();
});
test('partial PUT is durable, preserves omitted fields and attributes verified staff identity', async () => {
  const result = await call(request('PUT', { version: 0, studentSeatCap: 60, lessonPlannerMonthly: 0 }));
  expect(result.status).toBe(200);
  const value = await result.json();
  expect(value).toEqual({ ...defaults, studentSeatCap: 60, lessonPlannerMonthly: 0,
    updatedAt: expect.any(String), updatedByEmail: 'staff@example.test', version: 1 });
  expect(new Date(value.updatedAt).toISOString()).toBe(value.updatedAt);
  expect(await (await call(request())).json()).toEqual(value);
  expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({
    actorEmail: 'staff@example.test', keyId: 'limits-test', endpoint: 'PUT /api/internal/v1/free-tier/limits', result: 'success',
  }) });
  const next = await (await call(request('PUT', { version: 1, reporterMonthly: 0 }))).json();
  expect(next).toMatchObject({ studentSeatCap: 60, lessonPlannerMonthly: 0, reporterMonthly: 0, version: 2 });
});
test('stale versions never mutate or audit a successful update', async () => {
  await call(request('PUT', { version: 0, studentSeatCap: 10 }));
  audit.mockClear();
  const result = await call(request('PUT', { version: 0, reporterMonthly: 7 }));
  expect(result.status).toBe(409); expect(await result.json()).toEqual({ error: 'version_conflict' });
  expect(audit).not.toHaveBeenCalled();
  expect(await (await call(request())).json()).toMatchObject({ studentSeatCap: 10, reporterMonthly: 2, version: 1 });
});
for (const [field, low, high] of [['studentSeatCap', 1, 200], ['lessonPlannerMonthly', 0, 100], ['reporterMonthly', 0, 100]] as const) {
  test(`${field} integer bounds reject invalid values without partial writes`, async () => {
    for (const value of [low - 1, high + 1, 1.5, '2', null, true]) {
      const result = await call(request('PUT', { version: 0, lessonPlannerMonthly: 7, [field]: value }));
      expect(result.status).toBe(422); expect(await result.json()).toEqual({ error: 'out_of_bounds', field });
      expect(row).toBeNull();
    }
    for (const [version, value] of [low, high].entries()) {
      expect((await call(request('PUT', { version, [field]: value }))).status).toBe(200);
    }
  });
}
test('malformed payloads and missing/invalid versions have no side effects', async () => {
  for (const body of [null, [], {}, { studentSeatCap: 1 }, { version: -1, reporterMonthly: 1 },
    { version: 0.1, reporterMonthly: 1 }, { version: '0', reporterMonthly: 1 },
    { version: 0 }, { version: 0, updatedByEmail: 'spoof@example.test', studentSeatCap: 1 }]) {
    expect((await call(request('PUT', body))).status).toBe(400); expect(row).toBeNull();
  }
  const req = request('PUT', {}, '{');
  const malformed = new Request(url, { method: 'PUT', headers: req.headers, body: '{' });
  expect((await call(malformed)).status).toBe(400);
  expect(audit).not.toHaveBeenCalled();
});
test('base access is required; flag-off writes fail but persisted reads remain available', async () => {
  await call(request('PUT', { version: 0, reporterMonthly: 8 }));
  v2.mockResolvedValue(false); audit.mockClear();
  const result = await call(request('PUT', { version: 1, reporterMonthly: 9 }));
  expect(result.status).toBe(409); expect(await result.json()).toEqual({ error: 'flag_off' });
  expect(await (await call(request())).json()).toMatchObject({ reporterMonthly: 8, version: 1 });
  expect(audit).not.toHaveBeenCalled();
  enabled.mockResolvedValue(false);
  expect((await call(request())).status).toBe(404);
  expect((await call(request('PUT', { version: 1, reporterMonthly: 9 }))).status).toBe(404);
});
test('signature binds the actual body and actor; legacy, wrong scope and replay fail before storage', async () => {
  const cases = [new Request(url), new Request(url, { headers: { authorization: `Bearer ${'b'.repeat(43)}` } }),
    request('PUT', { version: 0, reporterMonthly: 10 }, '')];
  const actor = request(); actor.headers.set(auth.INTERNAL_API_HEADER_ACTOR, 'other@example.test'); cases.push(actor);
  for (const req of cases) expect((await call(req)).status).toBe(401);
  const replay = request(); expect((await call(replay)).status).toBe(200);
  findUnique.mockClear(); expect((await call(replay)).status).toBe(401);
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'limits-test', secret, scopes: ['management:read'] }]);
  expect((await call(request('PUT', { version: 0, studentSeatCap: 10 }))).status).toBe(403);
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'limits-test', secret, scopes: ['management:write'] }]);
  expect((await call(request())).status).toBe(403);
  expect(findUnique).not.toHaveBeenCalled(); expect(createMany).not.toHaveBeenCalled(); expect(audit).not.toHaveBeenCalled();
});
test('only GET and PUT, bounded JSON bodies and no environment overrides', async () => {
  expect((await call(request('POST', {}))).status).toBe(405);
  const content = request('PUT', { version: 0, reporterMonthly: 1 }); content.headers.set('content-type', 'text/plain');
  expect((await call(content)).status).toBe(400);
  const large = request('PUT', { version: 0, other: 'a'.repeat(32769) });
  expect((await call(large)).status).toBe(413);
  const query = new Request(url + '?env=production', { headers: request().headers });
  expect((await call(query)).status).toBe(400);
  expect(row).toBeNull();
});
