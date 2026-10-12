import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { resetInternalApiMemoryNonceStore } from './internal-platform-auth.server';

const auditCreate = mock(
  async (_args: {
    data: {
      requestHash: string;
      actorEmail?: string;
      keyId?: string;
      endpoint?: string;
      result?: string;
    };
  }) => ({})
);
const sendReleaseEmailsForApplicationIds = mock(
  async (
    _applicationIds: string[]
  ): Promise<{ applicationId: string; ok: boolean; error?: string }[]> => []
);

mock.module('~/utils/db.server', () => ({
  prisma: {
    internalPlatformApiAudit: { create: auditCreate },
    freeTierApplication: {
      findMany: mock(async () => [{ id: 'app-1' }]),
    },
  },
}));

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled: async () => true,
}));

mock.module('~/domain/free-tier/approval-flow.server', () => ({
  sendReleaseEmailsForApplicationIds,
}));

const secret = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
const keyConfig = JSON.stringify([
  {
    id: 'writer',
    secret,
    scopes: ['management:read', 'management:write'],
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

describe('free-tier operator HTTP', () => {
  const saved = {
    keys: process.env.YAWP_INTERNAL_API_KEYS,
    management: process.env.YAWP_MANAGEMENT_SERVICE_KEY,
    legacy: process.env.LEGACY_INTERNAL_KEY_ALLOWED,
  };

  beforeEach(() => {
    resetInternalApiMemoryNonceStore();
    process.env.INTERNAL_API_NONCE_STORE = 'memory';
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'false';
    process.env.YAWP_INTERNAL_API_KEYS = keyConfig;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = 'k'.repeat(43);
    auditCreate.mockReset();
    sendReleaseEmailsForApplicationIds.mockReset().mockResolvedValue([{ applicationId: 'app-1', ok: true }]);
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_NONCE_STORE;
    process.env.YAWP_INTERNAL_API_KEYS = saved.keys;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = saved.management;
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = saved.legacy;
    resetInternalApiMemoryNonceStore();
  });

  test('unsigned internal free-tier requests return 401 when legacy bearer is disabled', async () => {
    const { tokensList } = await import('./internal-free-tier-http.server');
    const res = await tokensList(
      new Request('https://yawp.test/api/internal/v1/free-tier/tokens', {
        headers: { authorization: `Bearer ${'k'.repeat(43)}` },
      })
    );
    expect(res.status).toBe(401);
  });

  test('signed GET tokens returns 200', async () => {
    mock.module('~/domain/free-tier/service.server', () => ({
      listAcquisitionTokensWithStats: async () => [],
      createAcquisitionTokens: async () => [],
      getFreeTierReleaseCap: () => 100,
      releaseBatch: async () => ({ released: 0, refused: 0, skipped: 0, cappedAt: 100 }),
      releaseBatchSchema: { parse: (v: unknown) => v },
      tokenCreateSchema: { parse: (v: unknown) => v },
      tokenPatchSchema: { parse: (v: unknown) => v },
      patchAcquisitionToken: async () => ({}),
      setAcquisitionTokenDisabled: async () => ({}),
    }));
    const { tokensList } = await import('./internal-free-tier-http.server');
    const res = await tokensList(await sign('GET', 'https://yawp.test/api/internal/v1/free-tier/tokens'));
    expect(res.status).toBe(200);
  });

  test('signed PATCH disable and enable record audit rows', async () => {
    const patchAcquisitionToken = mock(async () => ({ id: 'tok-1', label: 'NCTE' }));
    const setAcquisitionTokenDisabled = mock(async (id: string, disabled: boolean) => ({
      id,
      disabledAt: disabled ? new Date() : null,
    }));
    mock.module('~/domain/free-tier/service.server', () => ({
      listAcquisitionTokensWithStats: async () => [],
      createAcquisitionTokens: async () => [],
      getFreeTierReleaseCap: () => 100,
      releaseBatch: async () => ({ released: 0, refused: 0, skipped: 0, cappedAt: 100 }),
      releaseBatchSchema: { parse: (v: unknown) => v },
      tokenCreateSchema: { parse: (v: unknown) => v },
      tokenPatchSchema: { parse: (v: unknown) => v },
      patchAcquisitionToken,
      setAcquisitionTokenDisabled,
    }));
    const { tokensPatch, tokensDisable, tokensEnable } = await import('./internal-free-tier-http.server');
    const patchBody = JSON.stringify({ label: 'Updated', sourceName: 'NCTE 2026' });
    const patchReq = await sign(
      'PATCH',
      'https://yawp.test/api/internal/v1/free-tier/tokens/tok-1',
      patchBody
    );
    patchReq.headers.set('content-type', 'application/json');
    expect((await tokensPatch(patchReq, 'tok-1')).status).toBe(200);
    expect(patchAcquisitionToken).toHaveBeenCalled();
    expect((await tokensDisable(await sign('POST', 'https://yawp.test/api/internal/v1/free-tier/tokens/tok-1/disable'), 'tok-1')).status).toBe(200);
    expect((await tokensEnable(await sign('POST', 'https://yawp.test/api/internal/v1/free-tier/tokens/tok-1/enable'), 'tok-1')).status).toBe(200);
    expect(auditCreate.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  test('release batch sends the existing release access email', async () => {
    mock.module('~/domain/free-tier/service.server', () => ({
      releaseBatch: async () => ({ released: 1, refused: 0, skipped: 0, cappedAt: 100 }),
      releaseBatchSchema: {
        parse: (v: unknown) => v,
      },
      createAcquisitionTokens: async () => [],
      listAcquisitionTokensWithStats: async () => [],
      getFreeTierReleaseCap: () => 100,
      tokenCreateSchema: { parse: (v: unknown) => v },
      tokenPatchSchema: { parse: (v: unknown) => v },
      patchAcquisitionToken: async () => ({}),
      setAcquisitionTokenDisabled: async () => ({}),
    }));
    const { releaseBatchHttp } = await import('./internal-free-tier-http.server');
    const body = JSON.stringify({ applicationIds: ['app-1'] });
    const request = await sign('POST', 'https://yawp.test/api/internal/v1/free-tier/release', body);
    request.headers.set('content-type', 'application/json');
    const res = await releaseBatchHttp(request);
    expect(res.status).toBe(200);
    expect(sendReleaseEmailsForApplicationIds).toHaveBeenCalledWith(['app-1']);
    expect(auditCreate).toHaveBeenCalled();
    const hash = createHash('sha256').update(body).digest('hex');
    expect(auditCreate.mock.calls[0]?.[0]?.data?.requestHash).toBe(hash);
  });
});
