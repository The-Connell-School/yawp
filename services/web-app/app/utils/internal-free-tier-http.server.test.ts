import { expect, test } from 'bun:test';
import { applicationsSearch, tokensCreate, releaseBatchHttp, exportCsv } from './internal-free-tier-http.server';

const key = 'k'.repeat(43);

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
  } finally {
    if (old === undefined) delete process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    else process.env.YAWP_MANAGEMENT_SERVICE_KEY = old;
  }
});

