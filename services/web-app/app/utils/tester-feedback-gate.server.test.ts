import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createPreviewAccessMiddleware } from './preview-access.server';
import { authorizeInternalApiRequest, resetInternalApiMemoryNonceStore, resetInternalApiRateLimitBuckets, signInternalApiRequest } from './internal-platform-auth.server';
import { readTesterFeedback, readTesterFeedbackScreenshot, type FeedbackDependencies } from './tester-feedback.server';

const secret = 'synthetic-feedback-gate-signing-material';
const names = ['PREVIEW_ACCESS_GATE', 'YAWP_INTERNAL_API_KEYS', 'INTERNAL_API_NONCE_STORE', 'LEGACY_INTERNAL_KEY_ALLOWED'] as const;
const saved = names.map(name => process.env[name]);
beforeEach(() => {
  process.env.PREVIEW_ACCESS_GATE = 'on';
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
    { id: 'feedback-test', secret, scopes: ['management:read'] },
    { id: 'wrong-scope', secret, scopes: ['stats:read'] },
  ]);
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
  process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'false';
  resetInternalApiMemoryNonceStore();
  resetInternalApiRateLimitBuckets();
});
afterEach(() => {
  names.forEach((name, i) => {
    if (saved[i] === undefined) delete process.env[name];
    else process.env[name] = saved[i];
  });
});

// The local cross-repo run loads the actual Internal signer; CI also runs this
// boundary contract using the platform signer with the same wire format.
async function signed(url: string, options: { keyId?: string; nowSeconds?: number } = {}) {
  if (process.env.INTERNAL_SIGNER_PATH) {
    const { signPlatformRequest } = await import(process.env.INTERNAL_SIGNER_PATH);
    const target = new URL(url);
    return signPlatformRequest({ method: 'GET', pathAndQuery: target.pathname + target.search, actorEmail: 'Reviewer@Example.test', credentials: { keyId: options.keyId ?? 'feedback-test', secret }, nowSeconds: options.nowSeconds });
  }
  return signInternalApiRequest({ method: 'GET', url, actor: 'Reviewer@Example.test', keyId: options.keyId ?? 'feedback-test', secret, timestamp: options.nowSeconds ? String(options.nowSeconds) : undefined }).headers;
}

function setup() {
  const reads: unknown[] = [], audits: unknown[] = [];
  const deps: FeedbackDependencies = {
    enabled: () => true, environment: () => 'demo', getUser: async () => null, save: async () => false,
    authenticateInternal: authorizeInternalApiRequest,
    list: async input => { reads.push(input); return []; },
    auditInternalRead: async input => { audits.push(input); },
  };
  const middleware = createPreviewAccessMiddleware();
  const route = (request: Request) => middleware({ request, params: {}, context: {} as never, url: new URL(request.url), pattern: '*' }, () => readTesterFeedback(request, deps, 'internal')) as Promise<Response>;
  return { route, reads, audits };
}

test('gate passes exact feedback list/CSV paths to signed authorization with encoded filters and actor attribution', async () => {
  const { route, reads, audits } = setup();
  for (const format of ['json', 'csv']) {
    const url = `https://demo.example/api/internal/v1/tester-feedback?environment=demo&userId=tester+%2B%2F%7E&since=2026-10-01T00%3A00%3A00%2B00%3A00&until=2026-10-15T00%3A00%3A00Z&format=${format}`;
    const response = await route(new Request(url, { headers: await signed(url) }));
    expect(response.status).toBe(200);
    if (format === 'csv') {
      expect(response.headers.get('content-type')).toContain('text/csv');
      expect(response.headers.get('content-disposition')).toContain('attachment');
      expect(await response.text()).toContain('id,userId,url,');
    } else expect(await response.json()).toEqual({ entries: [], nextCursor: null });
  }
  expect(reads).toHaveLength(2);
  expect(reads[0]).toMatchObject({ environment: 'demo', userId: 'tester +/~', since: '2026-10-01T00:00:00+00:00' });
  expect(audits).toEqual([
    expect.objectContaining({ actorEmail: 'reviewer@example.test', keyId: 'feedback-test', result: 'list.success' }),
    expect.objectContaining({ actorEmail: 'reviewer@example.test', keyId: 'feedback-test', result: 'export.success' }),
  ]);
});

test('gate exception never grants protected feedback reads to invalid, expired, replayed or wrong-scope requests', async () => {
  const { route, reads, audits } = setup();
  for (const format of ['json', 'csv']) {
    const url = `https://demo.example/api/internal/v1/tester-feedback?environment=demo&format=${format}`;
    expect((await route(new Request(url))).status).toBe(401);
    const headers = await signed(url);
    expect((await route(new Request(url, { headers: { ...headers, 'X-Yawp-Signature': 'invalid' } }))).status).toBe(401);
    expect((await route(new Request(url.replace('environment=demo', 'environment=production'), { headers }))).status).toBe(401);
    expect((await route(new Request(url.replace('environment=demo', 'environment=%64emo'), { headers }))).status).toBe(401);
    expect((await route(new Request(url, { headers: { ...headers, 'X-Yawp-Nonce': '' } }))).status).toBe(401);
    expect((await route(new Request(url, { headers: await signed(url, { nowSeconds: Math.floor(Date.now() / 1000) - 301 }) }))).status).toBe(401);
    expect((await route(new Request(url, { headers: await signed(url, { keyId: 'wrong-scope' }) }))).status).toBe(403);
    expect(reads).toHaveLength(format === 'json' ? 0 : 1);
    expect((await route(new Request(url, { headers }))).status).toBe(200);
    expect((await route(new Request(url, { headers }))).status).toBe(401);
  }
  expect(reads).toHaveLength(2);
  expect(audits).toHaveLength(2);
  process.env.YAWP_INTERNAL_API_KEYS = '';
  const url = 'https://demo.example/api/internal/v1/tester-feedback';
  expect((await route(new Request(url, { headers: await signed(url) }))).status).toBe(404);
  expect(reads).toHaveLength(2);
});

test('feedback gate exception does not expose neighboring, admin or submission paths', async () => {
  const { route, reads } = setup();
  for (const path of ['/api/internal/v1/tester-feedback/', '/api/internal/v1/tester-feedback/other', '/api/internal/v1/tester-feedback-other', '/api/admin/tester-feedback', '/api/tester-feedback']) {
    const url = 'https://demo.example' + path;
    expect((await route(new Request(url, { headers: await signed(url) }))).status).toBe(401);
  }
  expect(reads).toHaveLength(0);
});

test('gate passes signed screenshot paths through to handler authorization', async () => {
  const screenshotId = 'clh1234567890123456789012';
  const loadScreenshot = mock(async () => null as string | null);
  const deps: FeedbackDependencies = {
    enabled: () => true,
    environment: () => 'demo',
    getUser: async () => null,
    save: async () => false,
    list: async () => [],
    authenticateInternal: authorizeInternalApiRequest,
    loadScreenshot,
  };
  const middleware = createPreviewAccessMiddleware();
  const screenshotUrl = `https://demo.example/api/internal/v1/tester-feedback/${screenshotId}/screenshot`;
  const screenshotRoute = (request: Request) =>
    middleware(
      { request, params: {}, context: {} as never, url: new URL(request.url), pattern: '*' },
      () => readTesterFeedbackScreenshot(request, screenshotId, deps)
    ) as Promise<Response>;
  expect((await screenshotRoute(new Request(screenshotUrl))).status).toBe(401);
  expect(
    (await screenshotRoute(new Request(screenshotUrl, { headers: await signed(screenshotUrl) })))
      .status
  ).toBe(404);
  expect(loadScreenshot).toHaveBeenCalledWith(screenshotId);
});
