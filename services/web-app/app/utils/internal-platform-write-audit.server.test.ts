import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { resetInternalApiMemoryNonceStore } from './internal-platform-auth.server';

const auditCreate = mock(async () => ({}));
const tokenFindUnique = mock(async () => null);
const tokenFindFirst = mock(async () => null);
const tokenCreate = mock(async () => ({ id: 'token-audit' }));
const prisma = {
  $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(prisma),
  $executeRaw: mock(async () => 1),
  acquisitionToken: {
    findUnique: tokenFindUnique,
    findFirst: tokenFindFirst,
    create: tokenCreate,
  },
  internalPlatformApiAudit: { create: auditCreate },
  setting: {
    findUnique: mock(async () => null),
    findMany: mock(async () => []),
    upsert: mock(async (args: { update: { value: string } }) => ({
      name: 'feature_flag.demo',
      value: args.update.value,
      updatedAt: new Date(),
    })),
  },
  organization: {
    findMany: mock(async () => []),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const secret = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
const keyConfig = JSON.stringify([
  {
    id: 'writer',
    secret,
    scopes: [
      'flags:write',
      'management:write',
      'rubrics:read',
      'rubrics:write',
    ],
  },
]);

async function sign(method: string, url: string, body = '') {
  const { signInternalApiRequest } = await import('./internal-platform-auth.server');
  const signed = signInternalApiRequest({
    method,
    url,
    body,
    keyId: 'writer',
    secret,
    actor: 'operator@yawp.school',
  });
  return new Request(url, { method, headers: signed.headers, body: body || undefined });
}

describe('signed internal writes record platform audit rows', () => {
  const saved = {
    keys: process.env.YAWP_INTERNAL_API_KEYS,
    management: process.env.YAWP_MANAGEMENT_SERVICE_KEY,
    primaryAppUrl: process.env.PRIMARY_APP_URL,
  };

  beforeEach(() => {
    resetInternalApiMemoryNonceStore();
    process.env.INTERNAL_API_NONCE_STORE = 'memory';
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'false';
    process.env.YAWP_INTERNAL_API_KEYS = keyConfig;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = 'k'.repeat(43);
    process.env.PRIMARY_APP_URL = 'https://demo.yawp.school';
    auditCreate.mockReset();
    tokenFindUnique.mockReset();
    tokenFindFirst.mockReset();
    tokenCreate.mockReset();
    tokenFindUnique.mockResolvedValue(null);
    tokenFindFirst.mockResolvedValue(null);
    tokenCreate.mockResolvedValue({ id: 'token-audit' });
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_NONCE_STORE;
    process.env.YAWP_INTERNAL_API_KEYS = saved.keys;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = saved.management;
    process.env.PRIMARY_APP_URL = saved.primaryAppUrl;
    resetInternalApiMemoryNonceStore();
  });

  test('feature flag update', async () => {
    const { featureFlagUpdate } = await import('./internal-feature-flags-http.server');
    const body = JSON.stringify({ enabled: true });
    const request = await sign(
      'POST',
      'https://yawp.test/api/internal/v1/feature-flags/lesson_planner',
      body
    );
    request.headers.set('content-type', 'application/json');
    request.headers.set('x-yawp-operator-email', 'ops@yawp.school');
    await featureFlagUpdate(request, 'lesson_planner');
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpoint: expect.stringContaining('feature-flags'),
        }),
      })
    );
  });

  test('free tier token mint', async () => {
    mock.module('~/domain/feature-flags/feature-flags.server', () => ({
      isFreeTierEnabled: async () => true,
    }));
    const { tokensCreate } = await import('./internal-free-tier-http.server');
    const body = JSON.stringify({ count: 1, label: 'audit-test' });
    const request = await sign('POST', 'https://yawp.test/api/internal/v1/free-tier/tokens', body);
    request.headers.set('content-type', 'application/json');
    await tokensCreate(request);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpoint: expect.stringContaining('free-tier/tokens'),
        }),
      })
    );
  });

  test('QA account create', async () => {
    const { createQaHttp } = await import('./internal-qa-http.server');
    const service = {
      create: async () => ({}),
      archive: async () => ({}),
      list: async () => ({ fixtures: [], nextCursor: null }),
    };
    const body = JSON.stringify({
      id: 'abf51c57-a733-4fc2-9c66-0d613d9e2e37',
      actorId: 'operator',
      organizationId: 'org',
      reason: 'QA',
      users: [{ name: 'Teacher', role: 'TEACHER' }],
    });
    const request = await sign('POST', 'https://yawp.test/api/internal/v1/qa/accounts', body);
    request.headers.set('content-type', 'application/json');
    await createQaHttp(service as any, () => 'k'.repeat(43), () => true).create(request);
    const hash = createHash('sha256').update(body).digest('hex');
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestHash: hash }),
      })
    );
  });

  test('organization search', async () => {
    const { createOrganizationManagementHandler } = await import('./internal-organizations.server');
    const directory = {
      findMany: async () => [{ id: 'org-a', name: 'Alpha' }],
    };
    const body = JSON.stringify({ q: 'al', limit: 10 });
    const request = await sign('POST', 'https://yawp.test/api/internal/v1/organizations/search', body);
    request.headers.set('content-type', 'application/json');
    await createOrganizationManagementHandler(directory as any, () => 'k'.repeat(43))(request);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endpoint: expect.stringContaining('organizations/search'),
        }),
      })
    );
  });
});
