import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as platformAuth from './internal-platform-auth.server';
import { createRubricHttp } from './internal-rubrics-http.server';
import { createRubricCatalogHttp } from './internal-rubric-catalog-http.server';

const realPlatformAuth = { ...platformAuth };
const bearer = 'r'.repeat(43);
const secret = 'rubric-body-test-signing-key-0123456789abcdef';
const limit = 300 * 1024;
const environment = ['YAWP_INTERNAL_API_KEYS', 'YAWP_MANAGEMENT_SERVICE_KEY', 'YAWP_CONTENT_SERVICE_KEY', 'LEGACY_INTERNAL_KEY_ALLOWED', 'INTERNAL_API_NONCE_STORE'] as const;
let saved: Record<string, string | undefined>;
const recordAudit = mock(async () => {});

beforeEach(() => {
  saved = Object.fromEntries(environment.map(name => [name, process.env[name]]));
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'rubric-body-test', secret, scopes: ['rubrics:write'] }]);
  process.env.YAWP_MANAGEMENT_SERVICE_KEY = bearer;
  process.env.YAWP_CONTENT_SERVICE_KEY = bearer;
  process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'true';
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
  realPlatformAuth.resetInternalApiMemoryNonceStore();
  recordAudit.mockClear();
  mock.module('./internal-platform-auth.server', () => ({ ...realPlatformAuth, recordInternalPlatformWriteAudit: recordAudit }));
});

afterEach(() => {
  mock.module('./internal-platform-auth.server', () => realPlatformAuth);
  realPlatformAuth.resetInternalApiMemoryNonceStore();
  for (const name of environment) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const schema = { name: 'body-test', title: 'Résumé', rubric: { categories: [{ key: 'claim', label: 'Claim', description: 'Explain the claim', weight: 1 }] } };
const source = { contentId: crypto.randomUUID(), version: 1, fingerprint: 'a'.repeat(64) };
const publication = { requestId: crypto.randomUUID(), actorId: 'body-actor', reason: 'Reviewed résumé', expectedFingerprint: null, source, schema };
const catalog = { key: 'body-test', requestId: crypto.randomUUID(), actorEmail: 'body@example.test', reason: 'Reviewed résumé', document: schema };
const routes = [
  { path: '/rubrics', method: 'publish', input: publication, error: 'Invalid rubric publication' },
  { path: '/rubrics/validate', method: 'validate', input: { schema }, error: 'Invalid validation request' },
  { path: '/rubric-catalog/versions', method: 'save', input: { ...catalog, expectedFingerprint: 'b'.repeat(64) }, error: 'Invalid save request' },
  { path: '/rubric-catalog/stage', method: 'stage', input: { ...catalog, source }, error: 'Invalid stage request' },
  { path: '/rubric-catalog/unrelease', method: 'clearRelease', input: { key: catalog.key, actorEmail: catalog.actorEmail, reason: catalog.reason }, error: 'Invalid unrelease request' },
] as const;

for (const route of routes) describe(`POST /api/internal/v1${route.path}`, () => {
  const url = `https://yawp.test/api/internal/v1${route.path}`;
  let calls: unknown[];
  let invoke: (request: Request) => Promise<Response>;
  beforeEach(() => {
    calls = [];
    const work = async (input: unknown) => { calls.push(input); return { accepted: true }; };
    const http = route.path.startsWith('/rubrics')
      ? createRubricHttp({ inspect: async () => null, publish: work } as any, () => bearer, () => true)
      : createRubricCatalogHttp({ list: work, get: work, save: work, stage: work, clearRelease: work } as any, () => bearer);
    invoke = (http as any)[route.method];
  });

  function request(body: Uint8Array | string, mode: 'hmac' | 'bearer' | 'both' | 'none' = 'hmac', signedBody = body) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (mode === 'hmac' || mode === 'both') {
      const signed = realPlatformAuth.signInternalApiRequest({ method: 'POST', url, body: signedBody, keyId: 'rubric-body-test', secret, actor: 'operator@example.test' });
      for (const [name, value] of Object.entries(signed.headers)) headers.set(name, value);
    }
    if (mode === 'bearer' || mode === 'both') headers.set('authorization', `Bearer ${bearer}`);
    return new Request(url, { method: 'POST', headers, body: typeof body === 'string' ? body : new Uint8Array(body) });
  }

  test.each(['hmac', 'bearer', 'both'] as const)('accepts exact compact and formatted JSON with %s auth', async mode => {
    for (const indent of [undefined, 2]) {
      const body = JSON.stringify(route.input, null, indent);
      const response = await invoke(request(body, mode));
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      if (route.path.startsWith('/rubric-catalog') && mode !== 'bearer') {
        expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({
          requestHash: createHash('sha256').update(body).digest('hex'),
          endpoint: `POST /api/internal/v1${route.path}`,
        }));
      }
    }
    if (route.method !== 'validate') expect(calls).toEqual([route.input, route.input]);
  });

  test('rejects whitespace changed after signing even with a valid bearer', async () => {
    const compact = JSON.stringify(route.input);
    for (const mode of ['hmac', 'both'] as const) {
      const response = await invoke(request(`${compact}\n`, mode, compact));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    }
    expect(calls).toHaveLength(0);
  });

  // Invalid bytes replace a character inside an otherwise valid JSON string.
  const invalidUtf8 = Buffer.from(JSON.stringify(route.input));
  invalidUtf8[invalidUtf8.indexOf(0xc3)] = 0xff;
  for (const [label, body] of [
    ['BOM', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(route.input))])],
    ['invalid UTF-8', invalidUtf8],
    ['invalid JSON', Buffer.from('{')],
  ] as const) {
    test(`${label} is authenticated before strict decoding and parsing`, async () => {
      const unauthorized = await invoke(request(body, 'hmac', 'different bytes'));
      expect(unauthorized.status).toBe(401);
      for (const mode of ['hmac', 'bearer', 'both'] as const) {
        const response = await invoke(request(body, mode));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: route.error });
      }
      expect(calls).toHaveLength(0);
    });
  }

  test('rejects declared oversize before authentication and cancels the body', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const response = await invoke(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(limit + 1) }, body }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Request body too large' });
    expect(cancelled).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test.each([undefined, '1'])('rejects streamed multibyte oversize before auth with Content-Length %s', async length => {
    let cancelled = false;
    const prefix = Buffer.from(`{"padding":"${'é'.repeat(limit / 2)}`);
    expect(prefix.byteLength).toBeGreaterThan(limit);
    expect(prefix.toString('utf8').length).toBeLessThan(limit);
    const chunks = [prefix.subarray(0, limit), prefix.subarray(limit), Buffer.from('"}')];
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(chunks[reads++]!); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const headers = new Headers({ 'content-type': 'application/json' });
    if (length) headers.set('content-length', length);
    const response = await invoke(new Request(url, { method: 'POST', headers, body }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Request body too large' });
    expect(cancelled).toBe(true);
    expect(reads).toBe(2);
    expect(calls).toHaveLength(0);
  });

  test('accepts exactly the byte cap with UTF-8 split across chunks', async () => {
    const text = JSON.stringify(route.input);
    const raw = Buffer.from(text + ' '.repeat(limit - Buffer.byteLength(text)));
    expect(raw.byteLength).toBe(limit);
    const split = raw.indexOf(0xc3) + 1;
    const signed = request(raw);
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(raw.subarray(0, split));
      controller.enqueue(raw.subarray(split));
      controller.close();
    } });
    const response = await invoke(new Request(url, { method: 'POST', headers: signed.headers, body }));
    expect(response.status).toBe(200);
  });
});
