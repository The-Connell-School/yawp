import { beforeEach, expect, mock, test } from 'bun:test';

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

test('internal endpoints return 404 when the free tier flag is off', async () => {
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
