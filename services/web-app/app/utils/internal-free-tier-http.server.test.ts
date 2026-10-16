import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const actualFeatureFlags = await import('~/domain/feature-flags/feature-flags.server');
const isFreeTierEnabled = mock(actualFeatureFlags.isFreeTierEnabled);
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  ...actualFeatureFlags,
  isFreeTierEnabled,
}));

const {
  applicationsSearch,
  tokensCreate,
  releaseBatchHttp,
  exportCsv,
  csv,
  approvalQueue,
  approvalDetail,
  approveHttp,
  rejectHttp,
  markManualReviewHttp,
  reopenHttp,
  submitAdminInfoHttp,
} = await import('./internal-free-tier-http.server');

const key = 'k'.repeat(43);

beforeEach(() => {
  isFreeTierEnabled.mockReset().mockResolvedValue(true);
});

test('release and token mint return 404 when the free tier flag is off', async () => {
  const old = process.env.YAWP_MANAGEMENT_SERVICE_KEY;
  process.env.YAWP_MANAGEMENT_SERVICE_KEY = key;
  isFreeTierEnabled.mockResolvedValue(false);
  try {
    const headers = new Headers({ authorization: `Bearer ${key}` });
    expect(
      (
        await applicationsSearch(
          new Request('https://yawp.test/api/internal/v1/free-tier/applications?q=x', {
            headers,
          })
        )
      ).status
    ).toBe(404);
    expect(
      (
        await releaseBatchHttp(
          new Request('https://yawp.test/api/internal/v1/free-tier/release', {
            method: 'POST',
            headers,
          })
        )
      ).status
    ).toBe(404);
  } finally {
    if (old === undefined) delete process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    else process.env.YAWP_MANAGEMENT_SERVICE_KEY = old;
    isFreeTierEnabled.mockResolvedValue(true);
  }
});

test('internal endpoints enforce management key and methods', async () => {
  const old = process.env.YAWP_MANAGEMENT_SERVICE_KEY;
  try {
    delete process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    expect((await applicationsSearch(new Request('https://yawp.test/api/internal/v1/free-tier/applications'))).status).toBe(404);
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = key;
    const badAuth = new Headers({ authorization: 'Bearer bad' });
    expect((await applicationsSearch(new Request('https://yawp.test/api/internal/v1/free-tier/applications?q=x', { headers: badAuth }))).status).toBe(401);
    const goodAuth = new Headers({ authorization: `Bearer ${key}` });
    // Wrong method
    expect((await tokensCreate(new Request('https://yawp.test/api/internal/v1/free-tier/tokens', { method: 'GET', headers: goodAuth }))).status).toBe(405);
    expect((await releaseBatchHttp(new Request('https://yawp.test/api/internal/v1/free-tier/release', { method: 'GET', headers: goodAuth }))).status).toBe(405);
    expect((await exportCsv(new Request('https://yawp.test/api/internal/v1/free-tier/export?q=x', { method: 'POST', headers: goodAuth }))).status).toBe(405);
    expect((await approvalQueue(new Request('https://yawp.test/api/internal/v1/free-tier/approval/queue', { method: 'POST', headers: goodAuth }))).status).toBe(405);
    expect((await approvalDetail(new Request('https://yawp.test/api/internal/v1/free-tier/approval/applications/a', { method: 'POST', headers: goodAuth }))).status).toBe(405);
  } finally {
    if (old === undefined) delete process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    else process.env.YAWP_MANAGEMENT_SERVICE_KEY = old;
  }
});


test('csv neutralises spreadsheet formulas and quotes separators', () => {
  expect(csv('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
  expect(csv('+1')).toBe("'+1");
  expect(csv('-2')).toBe("'-2");
  expect(csv('@SUM(A1)')).toBe("'@SUM(A1)");
  expect(csv('plain')).toBe('plain');
  expect(csv('a,b')).toBe('"a,b"');
  expect(csv('line\nbreak')).toBe('"line\nbreak"');
  expect(csv('cr\rhere')).toBe('"cr\rhere"');
});

test('every internal endpoint rejects a missing, short or wrong bearer before touching the database', async () => {
  const old = process.env.YAWP_MANAGEMENT_SERVICE_KEY;
  process.env.YAWP_MANAGEMENT_SERVICE_KEY = key;
  try {
    const bad = [undefined, 'Bearer', `Bearer ${key}x`, `bearer ${key}`, key];
    for (const header of bad) {
      const headers: Record<string, string> = header === undefined ? {} : { authorization: header };
      const make = (path: string, method: string) => new Request(`https://yawp.test/api/internal/v1/free-tier/${path}`, { method, headers });
      expect((await applicationsSearch(make('applications', 'GET'))).status).toBe(401);
      expect((await tokensCreate(make('tokens', 'POST'))).status).toBe(401);
      expect((await releaseBatchHttp(make('release', 'POST'))).status).toBe(401);
      expect((await exportCsv(make('export', 'GET'))).status).toBe(401);
      expect((await approvalQueue(make('approval/queue', 'GET'))).status).toBe(401);
      expect((await approvalDetail(make('approval/applications/a', 'GET'))).status).toBe(401);
      expect((await approveHttp(make('approval/a/approve', 'POST'))).status).toBe(401);
      expect((await rejectHttp(make('approval/a/reject', 'POST'))).status).toBe(401);
      expect((await markManualReviewHttp(make('approval/a/mark-manual-review', 'POST'))).status).toBe(401);
      expect((await reopenHttp(make('approval/a/reopen', 'POST'))).status).toBe(401);
      expect((await submitAdminInfoHttp(make('approval/a/submit', 'POST'))).status).toBe(401);
    }
    const tooLong = new Request('https://yawp.test/x', { headers: { authorization: `Bearer ${key}${'a'.repeat(600)}` } });
    expect((await applicationsSearch(tooLong)).status).toBe(401);
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = 'short';
    expect((await applicationsSearch(new Request('https://yawp.test/x', { headers: { authorization: 'Bearer short' } }))).status).toBe(503);
  } finally {
    if (old === undefined) delete process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    else process.env.YAWP_MANAGEMENT_SERVICE_KEY = old;
  }
});


// Use the real signed-read authorization and stub only database reads.
const db = { ...await import('~/utils/db.server') };
const auth = await import('./internal-platform-auth.server');
describe('signed waitlist CSV export', () => {
  const savedEnv = { ...process.env };
  const secret = 'local-export-test-secret-32-characters';
  let reads: ReturnType<typeof mockReads>;
  const fixture = {
    id: 'export-1', createdAt: new Date('2026-10-14T00:00:00Z'), status: 'LEAD',
    name: '=SUM(1,2)', email: 'intern@example.test', schoolName: 'Demo, "Academy"',
    location: 'Line\nBreak', gradeLevel: '+1', releasedAt: null,
    acquisitionTokenId: 'event-1', acquisitionToken: { label: '@event' },
  };
  const mockReads = () => mock(async (_input: any) => [fixture]);

  function signed(query = '', method = 'GET') {
    const url = `https://yawp.test/api/internal/v1/free-tier/export${query}`;
    return new Request(url, { method, headers: auth.signInternalApiRequest({
      method, url, keyId: 'export-test', secret, actor: 'operator@example.test',
    }).headers });
  }

  beforeEach(() => {
    process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
      { id: 'export-test', secret, scopes: ['management:read', 'management:write'] },
    ]);
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'false';
    process.env.INTERNAL_API_NONCE_STORE = 'memory';
    auth.resetInternalApiMemoryNonceStore();
    auth.resetInternalApiRateLimitBuckets();
    reads = mockReads();
    mock.module('~/utils/db.server', () => ({ ...db, prisma: new Proxy(db.prisma, {
      get(target, property) {
        return property === 'freeTierApplication' ? { findMany: reads } : Reflect.get(target, property);
      },
    }) }));
  });
  afterEach(() => {
    mock.module('~/utils/db.server', () => db);
    for (const name of ['YAWP_INTERNAL_API_KEYS', 'LEGACY_INTERNAL_KEY_ALLOWED', 'INTERNAL_API_NONCE_STORE']) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
    auth.resetInternalApiMemoryNonceStore();
    auth.resetInternalApiRateLimitBuckets();
  });

  test('empty query produces a bounded attachment with formula-safe escaped cells', async () => {
    const result = await exportCsv(signed());
    expect(result.status).toBe(200);
    expect(result.headers.get('content-disposition')).toBe('attachment; filename="free-tier-applications.csv"');
    expect(result.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.headers.get('x-export-truncated')).toBeNull();
    expect(reads).toHaveBeenCalledWith({ where: {}, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 10001, include: { acquisitionToken: { select: { label: true } } } });
    const content = await result.text();
    expect(content.startsWith('id,createdAt,status,name,email,schoolName,location,gradeLevel,releasedAt,acquisitionTokenId,acquisitionTokenLabel\n')).toBe(true);
    expect(content).toContain(`"'=SUM(1,2)"`);
    expect(content).toContain('"Demo, ""Academy"""');
    expect(content).toContain('"Line\nBreak"');
    expect(content).toContain("'+1");
    expect(content).toContain("'@event");
  });

  test('valid filters keep search semantics and export ignores valid search pagination', async () => {
    const result = await exportCsv(signed('?q=%20intern%20&status=LEAD&released=false&acquisitionTokenId=event-1&limit=1&cursor=unused'));
    expect(result.status).toBe(200);
    expect(reads.mock.calls[0][0]).toEqual({
      where: { status: 'LEAD', releasedAt: null, acquisitionTokenId: 'event-1', OR: [
        { email: { contains: 'intern', mode: 'insensitive' } },
        { name: { contains: 'intern', mode: 'insensitive' } },
        { schoolName: { contains: 'intern', mode: 'insensitive' } },
        { location: { contains: 'intern', mode: 'insensitive' } },
      ] }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 10001,
      include: { acquisitionToken: { select: { label: true } } },
    });
    reads.mockClear();
    expect((await exportCsv(signed('?released=true'))).status).toBe(200);
    expect(reads.mock.calls[0]?.[0]?.where).toEqual({ releasedAt: { not: null } });
  });

  test('empty results still produce the header and bounded exports report truncation', async () => {
    reads.mockResolvedValueOnce([]);
    const empty = await exportCsv(signed());
    expect(empty.status).toBe(200);
    expect((await empty.text()).split('\n')).toHaveLength(1);
    reads.mockResolvedValueOnce(Array.from({ length: 10000 }, (_, i) => ({ ...fixture, location: 'Test', id: `row-${i}` })) as never);
    const exact = await exportCsv(signed());
    expect(exact.status).toBe(200);
    expect(exact.headers.get('x-export-truncated')).toBeNull();
    expect((await exact.text()).split('\n')).toHaveLength(10001);
    reads.mockResolvedValueOnce(Array.from({ length: 10001 }, (_, i) => ({ ...fixture, location: 'Test', id: `row-${i}` })) as never);
    const capped = await exportCsv(signed());
    expect(capped.status).toBe(200);
    expect(capped.headers.get('x-export-truncated')).toBe('true');
    const csv = await capped.text();
    expect(csv.split('\n')).toHaveLength(10001);
    expect(csv).toContain('row-9999,');
    expect(csv).not.toContain('row-10000,');
  });

  test('invalid filters and pagination are rejected before querying', async () => {
    for (const query of ['?status=bogus', '?released=1', '?acquisitionTokenId=', '?q=' + 'x'.repeat(201), '?unknown=x', '?limit=101', '?limit=0', '?cursor=' + 'x'.repeat(501)]) {
      expect((await exportCsv(signed(query))).status).toBe(400);
    }
    expect(reads).not.toHaveBeenCalled();
  });

  test('applications search retains its 100-row maximum', async () => {
    for (const limit of ['101', '1000']) {
      const url = `https://yawp.test/api/internal/v1/free-tier/applications?limit=${limit}`;
      const request = new Request(url, { headers: auth.signInternalApiRequest({
        method: 'GET', url, keyId: 'export-test', secret, actor: 'operator@example.test',
      }).headers });
      expect((await applicationsSearch(request)).status).toBe(400);
    }
    expect(reads).not.toHaveBeenCalled();
  });

  test('wrong method, unsigned, tampered, and insufficient-scope reads are denied', async () => {
    expect((await exportCsv(signed('', 'POST'))).status).toBe(405);
    expect((await exportCsv(new Request('https://yawp.test/api/internal/v1/free-tier/export'))).status).toBe(401);
    const tampered = signed('?status=LEAD');
    expect((await exportCsv(new Request(tampered.url.replace('LEAD', 'APPROVED'), { headers: tampered.headers }))).status).toBe(401);
    process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'export-test', secret, scopes: ['stats:read'] }]);
    expect((await exportCsv(signed())).status).toBe(403);
    expect(reads).not.toHaveBeenCalled();
  });
});
