import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const auditCreate = mock(async () => ({}));
const prisma = {
  setting: {
    findUnique: mock(),
    findMany: mock(),
    upsert: mock(),
  },
  organization: {
    findMany: mock(),
  },
  internalPlatformApiAudit: {
    create: auditCreate,
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
  let oldYawpEnvironment: string | undefined;
  beforeEach(() => {
    // Other suites mock db.server in the same process; take it back.
    mock.module('~/utils/db.server', () => ({ prisma }));
    old = process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    oldYawpEnvironment = process.env.YAWP_ENVIRONMENT;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = key;
    delete process.env.YAWP_ENVIRONMENT;
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
    if (oldYawpEnvironment === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = oldYawpEnvironment;
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
      'lesson_planner_intake_v2',
      'lesson_planner_stack_v2',
      'lesson_planner_deck_v2',
      'lesson_planner_stack_panel',
      'lesson_planner_plan_export_v2',
      'free-tier-inapp-v2',
      'unified-sign-on',
      'free-tier-onboarding-v2',
      'classcode-unique',
      'demo-feedback-widget',
      'guided-tours',
    ]);
    expect(body.flags[0]).toMatchObject({ key: FLAG, mode: 'off', orgIds: [], enabled: false });
    expect(body.flags[1]).toMatchObject({ key: 'internal_rubrics', label: 'Rubrics from Yawp Internal', mode: 'off', orgIds: [], enabled: false });
    expect(body.flags[2]).toMatchObject({ key: 'free_tier', label: 'Free tier', mode: 'off', orgIds: [], enabled: false });
    expect(body.flags[8]).toMatchObject({
      key: 'free-tier-inapp-v2', label: 'Free tier in-app v2', mode: 'off', orgIds: [], enabled: false,
      persisted: { mode: 'off', orgIds: [] },
      effective: { mode: 'off', orgIds: [] }, runtimeOverride: null,
    });
    expect(body.flags[9]).toMatchObject({
      key: 'unified-sign-on', mode: 'off', orgIds: [], enabled: false,
      persisted: { mode: 'off', orgIds: [] },
      effective: { mode: 'off', orgIds: [] }, runtimeOverride: null,
    });
  });

  for (const environment of ['development', 'demo', 'production', 'preview']) {
    test(`guided tours stay off without a setting: ${environment}`, async () => {
      process.env.YAWP_ENVIRONMENT = environment;
      const response = await featureFlagsList(
        new Request(BASE, { headers: { authorization: `Bearer ${key}` } })
      );
      expect(response.status).toBe(200);
      const { flags } = await response.json();
      expect(flags.find((flag: { key: string }) => flag.key === 'guided-tours')).toMatchObject({
        key: 'guided-tours', mode: 'off', orgIds: [], enabled: false,
        persisted: { mode: 'off', orgIds: [] },
        effective: { mode: 'off', orgIds: [] }, runtimeOverride: null,
      });
      expect(prisma.setting.upsert).not.toHaveBeenCalled();
    });
  }

  for (const environment of ['development', 'demo', 'production', 'preview']) {
    for (const value of [undefined, 'invalid', '{"mode":"invalid"}']) {
      test(`onboarding v2 remains off without a valid setting: ${environment} / ${value}`, async () => {
        process.env.YAWP_ENVIRONMENT = environment;
        prisma.setting.findMany.mockResolvedValue(value === undefined ? [] : [{
          name: 'feature_flag.free-tier-onboarding-v2',
          value,
          description: null,
          updatedAt: new Date('2026-10-16T00:00:00Z'),
        }]);
        const response = await featureFlagsList(
          new Request(BASE, { headers: { authorization: `Bearer ${key}` } })
        );
        expect(response.status).toBe(200);
        const flags = (await response.json()).flags;
        expect(flags.filter((flag: { key: string }) => flag.key === 'free-tier-onboarding-v2')).toHaveLength(1);
        expect(flags.find((flag: { key: string }) => flag.key === 'free-tier-onboarding-v2')).toMatchObject({
          key: 'free-tier-onboarding-v2',
          label: 'Free tier onboarding v2',
          description: 'Approval reminders, forward requests, create-your-class step and locked preview for free-tier teachers.',
          mode: 'off', orgIds: [], enabled: false,
          persisted: { mode: 'off', orgIds: [] },
          effective: { mode: 'off', orgIds: [] }, runtimeOverride: null,
        });
        expect(prisma.setting.upsert).not.toHaveBeenCalled();
      });
    }
  }

  test('lists free tier as open on demo even when the stored flag is off', async () => {
    process.env.YAWP_ENVIRONMENT = 'demo';
    const response = await featureFlagsList(
      new Request(BASE, { headers: { authorization: `Bearer ${key}` } })
    );
    const body = await response.json();
    expect(body.flags.find((flag: { key: string }) => flag.key === 'free_tier')).toMatchObject({
      key: 'free_tier',
      mode: 'everyone',
      orgIds: [],
      persisted: { mode: 'off', orgIds: [] },
      effective: { mode: 'everyone', orgIds: [] },
      runtimeOverride: 'demo_free_tier',
      enabled: true,
    });
    expect(body.flags.find((flag: { key: string }) => flag.key === 'free-tier-inapp-v2')).toMatchObject({
      key: 'free-tier-inapp-v2', mode: 'off', orgIds: [], enabled: false,
      persisted: { mode: 'off', orgIds: [] },
      effective: { mode: 'off', orgIds: [] }, runtimeOverride: null,
    });
  });

  test('demo writes report the saved value without losing the runtime override', async () => {
    process.env.YAWP_ENVIRONMENT = 'demo';
    const response = await featureFlagUpdate(post({ mode: 'off' }, {}, 'free_tier'), 'free_tier');
    expect(response.status).toBe(200);
    expect((await response.json()).flag).toMatchObject({
      mode: 'off', enabled: false,
      persisted: { mode: 'off', orgIds: [] },
      effective: { mode: 'everyone', orgIds: [] }, runtimeOverride: 'demo_free_tier',
    });
    expect(prisma.setting.upsert.mock.calls[0][0].where).toEqual({ name: 'feature_flag.free_tier' });
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
      'lesson_planner_intake_v2',
      'lesson_planner_stack_v2',
      'lesson_planner_deck_v2',
      'lesson_planner_stack_panel',
      'lesson_planner_plan_export_v2',
      'free-tier-inapp-v2',
      'unified-sign-on',
      'free-tier-onboarding-v2',
      'classcode-unique',
      'demo-feedback-widget',
      'guided-tours',
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
      persisted: { mode: 'targeted', orgIds: ['org-1'] },
      effective: { mode: 'targeted', orgIds: ['org-1'] },
      runtimeOverride: null,
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

  test('signed demo reads expose persisted state independently of effective Everyone', async () => {
    const signingFixture = 'flags-read-fixture-key'.repeat(3);
    const names = ['YAWP_INTERNAL_API_KEYS', 'LEGACY_INTERNAL_KEY_ALLOWED', 'INTERNAL_API_NONCE_STORE'] as const;
    const saved = names.map((name) => process.env[name]);
    const { signInternalApiRequest, resetInternalApiMemoryNonceStore } = await import('./internal-platform-auth.server');
    process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'flags-reader', secret: signingFixture, scopes: ['flags:read'] }]);
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'false';
    process.env.INTERNAL_API_NONCE_STORE = 'memory';
    process.env.YAWP_ENVIRONMENT = 'demo';
    resetInternalApiMemoryNonceStore();
    prisma.setting.findMany.mockResolvedValue([{ name: 'feature_flag.free_tier', value: '{"mode":"off","orgIds":[]}', description: null, updatedAt: new Date('2026-10-14T00:00:00Z') }]);
    try {
      const signed = signInternalApiRequest({ method: 'GET', url: BASE, body: '', keyId: 'flags-reader', secret: signingFixture, actor: 'reader@example.test' });
      const response = await featureFlagsList(new Request(BASE, { headers: signed.headers }));
      expect(response.status).toBe(200);
      const flags = (await response.json()).flags;
      expect(flags.find((f: { key: string }) => f.key === 'free-tier-onboarding-v2')).toMatchObject({
        mode: 'off', enabled: false, runtimeOverride: null,
      });
      expect(flags.find((f: { key: string }) => f.key === 'free_tier')).toMatchObject({
        mode: 'everyone', persisted: { mode: 'off', orgIds: [] },
        effective: { mode: 'everyone', orgIds: [] }, runtimeOverride: 'demo_free_tier',
      });
      expect(prisma.setting.upsert).not.toHaveBeenCalled();
    } finally {
      names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; });
      resetInternalApiMemoryNonceStore();
    }
  });

  test('signed writes record an internal platform audit row', async () => {
    const secret = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
    const saved = {
      keys: process.env.YAWP_INTERNAL_API_KEYS,
      legacy: process.env.LEGACY_INTERNAL_KEY_ALLOWED,
      nonceStore: process.env.INTERNAL_API_NONCE_STORE,
    };
    process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
      { id: 'flags-writer', secret, scopes: ['flags:write'] },
    ]);
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'false';
    process.env.INTERNAL_API_NONCE_STORE = 'memory';
    auditCreate.mockReset();

    const { signInternalApiRequest, resetInternalApiMemoryNonceStore } = await import(
      './internal-platform-auth.server'
    );
    resetInternalApiMemoryNonceStore();
    const body = JSON.stringify({ enabled: true });
    const signed = signInternalApiRequest({
      method: 'POST',
      url: `${BASE}/${FLAG}`,
      body,
      keyId: 'flags-writer',
      secret,
      actor: 'ops@yawp.school',
    });
    const headers = new Headers(signed.headers);
    headers.set('content-type', 'application/json');
    headers.set('x-yawp-operator-email', 'ops@yawp.school');
    const request = new Request(`${BASE}/${FLAG}`, {
      method: 'POST',
      headers,
      body,
    });
    const response = await featureFlagUpdate(request, FLAG);
    expect(response.status).toBe(200);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          keyId: 'flags-writer',
          actorEmail: 'ops@yawp.school',
          endpoint: expect.stringContaining('feature-flags'),
          result: 'authorized',
        }),
      })
    );

    process.env.YAWP_INTERNAL_API_KEYS = saved.keys;
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = saved.legacy;
    if (saved.nonceStore === undefined) delete process.env.INTERNAL_API_NONCE_STORE;
    else process.env.INTERNAL_API_NONCE_STORE = saved.nonceStore;
    resetInternalApiMemoryNonceStore();
  });
});
