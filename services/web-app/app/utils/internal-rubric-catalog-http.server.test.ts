import { expect, test } from 'bun:test';
import { CatalogError } from '~/domain/rubrics/rubric-catalog.server';
import { createRubricCatalogHttp } from './internal-rubric-catalog-http.server';

const key = 'k'.repeat(43);
const base = 'https://yawp.test/api/internal/v1/rubric-catalog';
const get = (path = '', credential = key) => new Request(`${base}${path}`, { headers: { authorization: `Bearer ${credential}` } });
const post = (body: unknown, credential = key, path = '/versions') => new Request(`${base}${path}`, { method: 'POST', headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const valid = { key: 'daily-pages-engagement', requestId: crypto.randomUUID(), actorEmail: 'Brian@TheConnellSchool.com', reason: 'Tighten evidence descriptor', expectedFingerprint: 'a'.repeat(64), document: { name: 'daily-pages-engagement', title: 'x', rubric: { categories: [] } } };

function fake(overrides: Partial<Record<'list' | 'get' | 'save' | 'stage' | 'clearRelease', (...args: any[]) => Promise<any>>> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const wrap = (method: string, fn: (...args: any[]) => Promise<any>) => async (...args: any[]) => { calls.push({ method, args }); return fn(...args); };
  return { calls, service: { list: wrap('list', overrides.list ?? (async () => ({ rubrics: [] }))), get: wrap('get', overrides.get ?? (async () => ({ rubric: {} }))), save: wrap('save', overrides.save ?? (async () => ({ revision: { version: 2 } }))), stage: wrap('stage', overrides.stage ?? (async () => ({ revision: { version: 3 }, replayed: false }))), clearRelease: wrap('clearRelease', overrides.clearRelease ?? (async () => ({ key: 'daily-pages-engagement', cleared: true, previous: null }))) } };
}

test('every route requires the management key and the right method', async () => {
  const { service, calls } = fake();
  const http = createRubricCatalogHttp(service as any, () => key);
  expect((await http.list(get('', 'wrong'))).status).toBe(401);
  expect((await http.get(get('/item?key=x', 'wrong'))).status).toBe(401);
  expect((await http.save(post(valid, 'wrong'))).status).toBe(401);
  expect((await http.list(post({}, key, ''))).status).toBe(405);
  expect((await http.save(get('/versions'))).status).toBe(405);
  expect((await createRubricCatalogHttp(service as any, () => undefined).list(get())).status).toBe(404);
  expect((await createRubricCatalogHttp(service as any, () => 'short').list(get())).status).toBe(503);
  expect(calls).toHaveLength(0);
  const ok = await http.list(get());
  expect(ok.status).toBe(200); expect(ok.headers.get('cache-control')).toBe('no-store');
});

test('reads accept exactly one key and writes accept exactly the documented body', async () => {
  const { service, calls } = fake();
  const http = createRubricCatalogHttp(service as any, () => key);
  for (const query of ['', '?key=a&key=b', '?key=a&org=b', '?name=a']) expect((await http.get(get(`/item${query}`))).status).toBe(400);
  expect((await http.list(get('?x=1'))).status).toBe(400);
  for (const body of [{ ...valid, requestId: 'nope' }, { ...valid, actorEmail: 'not-an-email' }, { ...valid, reason: '' }, { ...valid, expectedFingerprint: 'x' }, { ...valid, extra: true }, { ...valid, document: [] }]) {
    expect((await http.save(post(body))).status).toBe(400);
  }
  expect((await http.save(new Request(`${base}/versions`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'text/plain' }, body: '{}' }))).status).toBe(400);
  expect((await http.save(post({ ...valid, document: { notes: 'x'.repeat(310000) } }))).status).toBe(400);
  expect(calls).toHaveLength(0);
  expect((await http.get(get('/item?key=assignment-type%3Aabc'))).status).toBe(200);
  expect(calls[0]).toEqual({ method: 'get', args: ['assignment-type:abc'] });
  expect((await http.save(post(valid))).status).toBe(200);
  expect((calls[1]!.args[0] as any).actorEmail).toBe('brian@theconnellschool.com');
});

test('domain errors map to status codes with field issues; unexpected errors leak nothing', async () => {
  const issues = [{ path: '/rubric/categories/0/label', message: 'Required' }];
  const http = createRubricCatalogHttp(fake({
    save: async () => { throw new CatalogError('Rubric validation failed', 422, issues); },
    get: async () => { throw new CatalogError('Unknown rubric', 404); },
    list: async () => { throw new Error('connect ECONNREFUSED postgres://admin:secret@db'); },
  }).service as any, () => key);
  const saved = await http.save(post(valid));
  expect(saved.status).toBe(422); expect(await saved.json()).toEqual({ error: 'Rubric validation failed', issues });
  expect((await http.get(get('/item?key=nope'))).status).toBe(404);
  const listed = await http.list(get());
  expect(listed.status).toBe(503); expect(await listed.text()).not.toContain('secret');
  for (const code of [403, 409]) {
    const h = createRubricCatalogHttp(fake({ save: async () => { throw new CatalogError('Stale', code); } }).service as any, () => key);
    expect((await h.save(post(valid))).status).toBe(code);
  }
});

const validStage = { key: 'daily-pages-engagement', requestId: crypto.randomUUID(), actorEmail: 'Staff@Yawp.Test', reason: 'Stage for demo orgs', document: { name: 'daily-pages-engagement', title: 'x', rubric: { categories: [] } }, source: { contentId: crypto.randomUUID(), version: 2, fingerprint: 'b'.repeat(64) } };

test('stage requires the management key, POST and exactly the documented body', async () => {
  const { service, calls } = fake();
  const http = createRubricCatalogHttp(service as any, () => key);
  expect((await http.stage(post(validStage, 'wrong', '/stage'))).status).toBe(401);
  expect((await http.stage(get('/stage'))).status).toBe(405);
  expect((await createRubricCatalogHttp(service as any, () => undefined).stage(post(validStage, key, '/stage'))).status).toBe(404);
  expect((await http.stage(post(validStage, key, '/stage?x=1'))).status).toBe(400);
  const { source: _source, ...noSource } = validStage;
  for (const body of [
    noSource, { ...validStage, expectedFingerprint: 'a'.repeat(64) }, { ...validStage, requestId: 'nope' },
    { ...validStage, actorEmail: 'nope' }, { ...validStage, reason: 'no' }, { ...validStage, reason: 'x'.repeat(501) }, { ...validStage, document: [] },
    { ...validStage, source: { ...validStage.source, contentId: 'not-a-uuid' } },
    { ...validStage, source: { ...validStage.source, version: 0 } },
    { ...validStage, source: { ...validStage.source, version: 1.5 } },
    { ...validStage, source: { ...validStage.source, fingerprint: 'B'.repeat(64) } },
    { ...validStage, source: { ...validStage.source, extra: true } },
  ]) expect((await http.stage(post(body, key, '/stage'))).status).toBe(400);
  expect((await http.stage(post({ ...validStage, document: { notes: 'x'.repeat(310000) } }, key, '/stage'))).status).toBe(400);
  expect(calls).toHaveLength(0);
  const ok = await http.stage(post(validStage, key, '/stage'));
  expect(ok.status).toBe(200); expect(ok.headers.get('cache-control')).toBe('no-store');
  expect(await ok.json()).toEqual({ revision: { version: 3 }, replayed: false });
  expect(calls).toHaveLength(1);
  expect(calls[0]!.method).toBe('stage');
  expect((calls[0]!.args[0] as any).actorEmail).toBe('staff@yawp.test');
  expect((calls[0]!.args[0] as any).source).toEqual(validStage.source);
});

test('stage maps domain errors like save', async () => {
  for (const code of [403, 404, 409, 422]) {
    const h = createRubricCatalogHttp(fake({ stage: async () => { throw new CatalogError('No', code); } }).service as any, () => key);
    expect((await h.stage(post(validStage, key, '/stage'))).status).toBe(code);
  }
  const h = createRubricCatalogHttp(fake({ stage: async () => { throw new Error('password=secret'); } }).service as any, () => key);
  const failed = await h.stage(post(validStage, key, '/stage'));
  expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('secret');
});

test('the stage route delegates to the catalog stage handler', async () => {
  const route = await import('~/routes/api.internal.v1.rubric-catalog.stage/route');
  expect(typeof route.action).toBe('function');
});

test('stage returns the released revision unchanged from the catalog', async () => {
  const release = { revisionId: 'rev-3', version: 3, releasedAt: '2026-10-09T12:00:00.000Z' };
  const revision = { id: 'rev-3', rubricName: 'daily-pages-engagement', version: 3, createdBy: 'staff@yawp.test', reason: 'Stage', createdAt: '2026-10-09T12:00:00.000Z', fingerprint: 'c'.repeat(64) };
  const http = createRubricCatalogHttp(fake({ stage: async () => ({ revision, replayed: false, release }) }).service as any, () => key);
  const ok = await http.stage(post(validStage, key, '/stage'));
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ revision, replayed: false, release });
});

const validClear = { key: 'daily-pages-engagement', actorEmail: 'Staff@Yawp.Test', reason: 'Roll back the release' };

test('unrelease requires the management key, POST and exactly the documented body', async () => {
  const { service, calls } = fake();
  const http = createRubricCatalogHttp(service as any, () => key);
  expect((await http.clearRelease(post(validClear, 'wrong', '/unrelease'))).status).toBe(401);
  expect((await http.clearRelease(get('/unrelease'))).status).toBe(405);
  expect((await createRubricCatalogHttp(service as any, () => undefined).clearRelease(post(validClear, key, '/unrelease'))).status).toBe(404);
  expect((await http.clearRelease(post(validClear, key, '/unrelease?x=1'))).status).toBe(400);
  for (const body of [{ ...validClear, extra: true }, { ...validClear, actorEmail: 'nope' }, { ...validClear, reason: 'no' }, { ...validClear, key: '' }]) {
    expect((await http.clearRelease(post(body, key, '/unrelease'))).status).toBe(400);
  }
  expect(calls).toHaveLength(0);
  const ok = await http.clearRelease(post(validClear, key, '/unrelease'));
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ key: 'daily-pages-engagement', cleared: true, previous: null });
  expect(calls).toEqual([{ method: 'clearRelease', args: [{ ...validClear, actorEmail: 'staff@yawp.test' }] }]);
  const missing = createRubricCatalogHttp(fake({ clearRelease: async () => { throw new CatalogError('Unknown rubric', 404); } }).service as any, () => key);
  expect((await missing.clearRelease(post(validClear, key, '/unrelease'))).status).toBe(404);
});

test('the unrelease route delegates to the catalog clearRelease handler', async () => {
  const route = await import('~/routes/api.internal.v1.rubric-catalog.unrelease/route');
  expect(typeof route.action).toBe('function');
});
