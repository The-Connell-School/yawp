import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  setting: {
    findUnique: mock(),
    findMany: mock(),
    upsert: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { featureFlagsList, featureFlagUpdate } = await import(
  './internal-feature-flags-http.server'
);

const key = 'k'.repeat(43);
const FLAG = 'daily_pages_paragraph_type_and_writing_time';
const NAME = `feature_flag.${FLAG}`;
const BASE = 'https://yawp.test/api/internal/v1/feature-flags';

function post(
  body: unknown,
  headers: Record<string, string> = {},
  flag = FLAG
) {
  return new Request(`${BASE}/${flag}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'x-yawp-operator-email': 'ops@yawp.school',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('internal feature-flag endpoints', () => {
  let old: string | undefined;
  beforeEach(() => {
    old = process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = key;
    prisma.setting.findUnique.mockReset().mockResolvedValue(null);
    prisma.setting.findMany.mockReset().mockResolvedValue([]);
    prisma.setting.upsert.mockReset();
  });
  afterEach(() => {
    if (old === undefined) delete process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    else process.env.YAWP_MANAGEMENT_SERVICE_KEY = old;
  });

  test('are hidden when no management key is configured', async () => {
    delete process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    expect((await featureFlagsList(new Request(BASE))).status).toBe(404);
    expect((await featureFlagUpdate(post({ enabled: true }), FLAG)).status).toBe(404);
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('reject a missing, short or wrong bearer before touching the database', async () => {
    for (const header of [undefined, 'Bearer', `Bearer ${key}x`, `bearer ${key}`, key]) {
      const headers: Record<string, string> = header === undefined ? {} : { authorization: header };
      expect((await featureFlagsList(new Request(BASE, { headers }))).status).toBe(401);
      const request = new Request(`${BASE}/${FLAG}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      expect((await featureFlagUpdate(request, FLAG)).status).toBe(401);
    }
    expect(prisma.setting.findMany).not.toHaveBeenCalled();
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('enforce methods', async () => {
    const auth = { authorization: `Bearer ${key}` };
    expect((await featureFlagsList(new Request(BASE, { method: 'POST', headers: auth }))).status).toBe(405);
    expect((await featureFlagUpdate(new Request(`${BASE}/${FLAG}`, { headers: auth }), FLAG)).status).toBe(405);
  });

  test('lists the flags, off by default, without caching', async () => {
    const response = await featureFlagsList(
      new Request(BASE, { headers: { authorization: `Bearer ${key}` } })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.flags).toHaveLength(2);
    expect(body.flags[0]).toMatchObject({ key: FLAG, enabled: false });
  });

  test('turns a flag on and reports the change', async () => {
    prisma.setting.upsert.mockResolvedValue({
      name: NAME,
      value: 'true',
      description: 'Last changed by ops@yawp.school',
      updatedAt: new Date('2026-10-07T16:00:00Z'),
    });
    const response = await featureFlagUpdate(post({ enabled: true }), FLAG);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      flag: { key: FLAG, enabled: true, lastChangedBy: 'ops@yawp.school' },
      previousEnabled: false,
      changed: true,
    });
    expect(prisma.setting.upsert.mock.calls[0]?.[0].update.value).toBe('true');
  });

  test('turns a flag off', async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: 'true' });
    prisma.setting.upsert.mockResolvedValue({
      name: NAME,
      value: 'false',
      description: 'Last changed by ops@yawp.school',
      updatedAt: new Date(),
    });
    const body = await (await featureFlagUpdate(post({ enabled: false }), FLAG)).json();
    expect(body).toMatchObject({ flag: { enabled: false }, previousEnabled: true, changed: true });
  });

  test('refuses an unknown flag', async () => {
    const response = await featureFlagUpdate(post({ enabled: true }, {}, 'nope'), 'nope');
    expect(response.status).toBe(404);
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('refuses a body without a boolean "enabled"', async () => {
    for (const body of [{}, { enabled: 'true' }, { enabled: 1 }, { enabled: true, extra: 1 }, '[]', 'not json']) {
      const response = await featureFlagUpdate(post(body), FLAG);
      expect(response.status).toBe(400);
    }
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('refuses a non-JSON content type', async () => {
    const response = await featureFlagUpdate(
      post({ enabled: true }, { 'content-type': 'text/plain' }),
      FLAG
    );
    expect(response.status).toBe(400);
  });

  test('requires the operator email so every change is attributable', async () => {
    const response = await featureFlagUpdate(
      post({ enabled: true }, { 'x-yawp-operator-email': 'not-an-email' }),
      FLAG
    );
    expect(response.status).toBe(400);
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });
});
