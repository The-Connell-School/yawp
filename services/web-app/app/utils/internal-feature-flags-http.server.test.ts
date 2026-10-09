import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  setting: {
    findUnique: mock(),
    findMany: mock(),
    upsert: mock(),
  },
  organization: {
    findMany: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { featureFlagsList, featureFlagUpdate } = await import(
  './internal-feature-flags-http.server'
);

const key = 'k'.repeat(43);
const FLAG = 'lesson_planner';
/** Removed with its feature (Daily Pages paragraph type and writing time). */
const REMOVED_FLAG = 'daily_pages_paragraph_type_and_writing_time';
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
    // Other suites mock db.server in the same process; take it back.
    mock.module('~/utils/db.server', () => ({ prisma }));
    old = process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = key;
    prisma.setting.findUnique.mockReset().mockResolvedValue(null);
    prisma.setting.findMany.mockReset().mockResolvedValue([]);
    prisma.setting.upsert.mockReset().mockImplementation(
      async (args: { update: { value: string; description: string } }) => ({
        name: NAME,
        value: args.update.value,
        description: args.update.description,
        updatedAt: new Date('2026-10-07T16:00:00Z'),
      })
    );
    prisma.organization.findMany
      .mockReset()
      .mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in
          .filter((id) => id.startsWith('org-'))
          .map((id) => ({ id }))
      );
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
    expect(body.flags.map((flag: { key: string }) => flag.key)).toEqual([
      FLAG,
      'internal_rubrics',
      'free_tier',
    ]);
    expect(body.flags[0]).toMatchObject({ key: FLAG, mode: 'off', orgIds: [], enabled: false });
    expect(body.flags[1]).toMatchObject({ key: 'internal_rubrics', label: 'Rubrics from Yawp Internal', mode: 'off', orgIds: [], enabled: false });
    expect(body.flags[2]).toMatchObject({ key: 'free_tier', label: 'Free tier', mode: 'off', orgIds: [], enabled: false });
  });

  test('no longer lists the removed writing-conditions flag, even if its row is still stored', async () => {
    prisma.setting.findMany.mockResolvedValue([
      {
        name: `feature_flag.${REMOVED_FLAG}`,
        value: 'true',
        description: null,
        updatedAt: new Date('2026-10-07T16:00:00Z'),
      },
    ]);
    const response = await featureFlagsList(
      new Request(BASE, { headers: { authorization: `Bearer ${key}` } })
    );
    const body = await response.json();
    expect(body.flags.map((flag: { key: string }) => flag.key)).toEqual([
      FLAG,
      'internal_rubrics',
      'free_tier',
    ]);
  });

  test('lists each flag with its mode, schools, and legacy enabled', async () => {
    prisma.setting.findMany.mockResolvedValue([
      {
        name: NAME,
        value: '{"mode":"targeted","orgIds":["org-1"]}',
        description: 'Last changed by ops@yawp.school',
        updatedAt: new Date('2026-10-07T16:00:00Z'),
      },
    ]);
    const response = await featureFlagsList(
      new Request(BASE, { headers: { authorization: `Bearer ${key}` } })
    );
    const body = await response.json();
    expect(body.flags[0]).toEqual({
      key: FLAG,
      label: expect.any(String),
      description: expect.any(String),
      mode: 'targeted',
      orgIds: ['org-1'],
      enabled: false,
      updatedAt: '2026-10-07T16:00:00.000Z',
      lastChangedBy: 'ops@yawp.school',
    });
  });

  test('legacy {enabled: true} turns a flag on for everyone and reports the change', async () => {
    const response = await featureFlagUpdate(post({ enabled: true }), FLAG);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      flag: {
        key: FLAG,
        mode: 'everyone',
        orgIds: [],
        enabled: true,
        lastChangedBy: 'ops@yawp.school',
      },
      previous: { mode: 'off', orgIds: [] },
      changed: true,
    });
    expect(JSON.parse(prisma.setting.upsert.mock.calls[0]?.[0].update.value)).toEqual({
      mode: 'everyone',
      orgIds: [],
    });
  });

  test('legacy {enabled: false} turns a flag off', async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: 'true' });
    const body = await (await featureFlagUpdate(post({ enabled: false }), FLAG)).json();
    expect(body).toMatchObject({
      flag: { mode: 'off', orgIds: [], enabled: false },
      previous: { mode: 'everyone', orgIds: [] },
      changed: true,
    });
  });

  test('targets a flag at schools after checking they exist', async () => {
    const response = await featureFlagUpdate(
      post({ mode: 'targeted', orgIds: ['org-1', 'org-2', 'org-1'] }),
      FLAG
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      flag: { key: FLAG, mode: 'targeted', orgIds: ['org-1', 'org-2'], enabled: false },
      previous: { mode: 'off', orgIds: [] },
      changed: true,
    });
    expect(prisma.organization.findMany).toHaveBeenCalledTimes(1);
  });

  test('everyone and off clear any schools sent with them', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: '{"mode":"targeted","orgIds":["org-1"]}',
    });
    for (const mode of ['everyone', 'off'] as const) {
      const body = await (
        await featureFlagUpdate(post({ mode, orgIds: ['org-1', 'unknown'] }), FLAG)
      ).json();
      expect(body).toMatchObject({
        flag: { mode, orgIds: [] },
        previous: { mode: 'targeted', orgIds: ['org-1'] },
        changed: true,
      });
    }
    const body = await (await featureFlagUpdate(post({ mode: 'everyone' }), FLAG)).json();
    expect(body.flag).toMatchObject({ mode: 'everyone', orgIds: [], enabled: true });
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
  });

  test('refuses unknown organizations and names them', async () => {
    const response = await featureFlagUpdate(
      post({ mode: 'targeted', orgIds: ['org-1', 'nope-1', 'nope-2'] }),
      FLAG
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Unknown organizations',
      unknownOrgIds: ['nope-1', 'nope-2'],
    });
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('refuses targeted with no schools', async () => {
    for (const body of [{ mode: 'targeted', orgIds: [] }, { mode: 'targeted' }]) {
      const response = await featureFlagUpdate(post(body), FLAG);
      expect(response.status).toBe(400);
    }
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('accepts up to 2000 schools and refuses more', async () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `org-${i}`);
    const ok = await featureFlagUpdate(post({ mode: 'targeted', orgIds: ids(2000) }), FLAG);
    expect(ok.status).toBe(200);
    expect((await ok.json()).flag.orgIds).toHaveLength(2000);
    const tooMany = await featureFlagUpdate(post({ mode: 'targeted', orgIds: ids(2001) }), FLAG);
    expect(tooMany.status).toBe(400);
    expect(prisma.setting.upsert).toHaveBeenCalledTimes(1);
  });

  test('refuses a malformed mode body', async () => {
    for (const body of [
      { mode: 'sometimes', orgIds: [] },
      { mode: 'targeted', orgIds: 'org-1' },
      { mode: 'targeted', orgIds: [1] },
      { mode: 'targeted', orgIds: [''] },
      { mode: 'targeted', orgIds: ['org-1'], extra: 1 },
      { mode: 'everyone', enabled: true },
      { orgIds: ['org-1'] },
    ]) {
      const response = await featureFlagUpdate(post(body), FLAG);
      expect(response.status).toBe(400);
    }
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('fails with 500, not a write, when the organization check fails', async () => {
    prisma.organization.findMany.mockRejectedValue(new Error('db down'));
    const error = console.error;
    console.error = () => {};
    try {
      const response = await featureFlagUpdate(
        post({ mode: 'targeted', orgIds: ['org-1'] }),
        FLAG
      );
      expect(response.status).toBe(500);
    } finally {
      console.error = error;
    }
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('refuses an unknown flag', async () => {
    const response = await featureFlagUpdate(post({ enabled: true }, {}, 'nope'), 'nope');
    expect(response.status).toBe(404);
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('refuses the removed writing-conditions flag as unknown', async () => {
    const response = await featureFlagUpdate(
      post({ enabled: true }, {}, REMOVED_FLAG),
      REMOVED_FLAG
    );
    expect(response.status).toBe(404);
    expect(prisma.setting.findUnique).not.toHaveBeenCalled();
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('refuses a body that is neither {enabled} nor {mode, orgIds}', async () => {
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
    for (const body of [{ enabled: true }, { mode: 'targeted', orgIds: ['org-1'] }]) {
      const response = await featureFlagUpdate(
        post(body, { 'x-yawp-operator-email': 'not-an-email' }),
        FLAG
      );
      expect(response.status).toBe(400);
      const missing = new Request(`${BASE}/${FLAG}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect((await featureFlagUpdate(missing, FLAG)).status).toBe(400);
    }
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });
});
