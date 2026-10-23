import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { readTesterFeedbackScreenshot } from '~/utils/tester-feedback.server';

const secret = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
const keyConfig = JSON.stringify([
  { id: 'feedback-test', secret, scopes: ['management:read'] },
  { id: 'stats-test', secret, scopes: ['stats:read'] },
]);
const feedbackId = 'clh1234567890123456789012';
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00, 0x10]);
const jpegDataUrl = `data:image/jpeg;base64,${Buffer.from(jpegBytes).toString('base64')}`;

describe('GET /api/internal/v1/tester-feedback/:id/screenshot', () => {
  const saved = {
    keys: process.env.YAWP_INTERNAL_API_KEYS,
    nonceStore: process.env.INTERNAL_API_NONCE_STORE,
    legacy: process.env.LEGACY_INTERNAL_KEY_ALLOWED,
  };

  beforeEach(() => {
    process.env.YAWP_INTERNAL_API_KEYS = keyConfig;
    process.env.INTERNAL_API_NONCE_STORE = 'memory';
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'false';
  });

  afterEach(async () => {
    process.env.YAWP_INTERNAL_API_KEYS = saved.keys;
    if (saved.nonceStore === undefined) delete process.env.INTERNAL_API_NONCE_STORE;
    else process.env.INTERNAL_API_NONCE_STORE = saved.nonceStore;
    if (saved.legacy === undefined) delete process.env.LEGACY_INTERNAL_KEY_ALLOWED;
    else process.env.LEGACY_INTERNAL_KEY_ALLOWED = saved.legacy;
    const { resetInternalApiMemoryNonceStore } = await import(
      '~/utils/internal-platform-auth.server'
    );
    resetInternalApiMemoryNonceStore();
  });

  test('rejects unsigned, wrong-scope, missing, and empty screenshot requests', async () => {
    const { authorizeInternalApiRequest, signInternalApiRequest, resetInternalApiMemoryNonceStore } =
      await import('~/utils/internal-platform-auth.server');
    resetInternalApiMemoryNonceStore();
    const url = `https://yawp.test/api/internal/v1/tester-feedback/${feedbackId}/screenshot`;
    const loadScreenshot = mock(async () => null as string | null);
    const auditInternalRead = mock(async () => {});
    const deps = {
      enabled: () => true,
      environment: () => 'demo',
      getUser: async () => null,
      save: async () => false,
      list: async () => [],
      authenticateInternal: authorizeInternalApiRequest,
      loadScreenshot,
      auditInternalRead,
    };

    expect(
      (await readTesterFeedbackScreenshot(new Request(url), feedbackId, deps)).status
    ).toBe(401);

    const wrongScope = signInternalApiRequest({
      method: 'GET',
      url,
      keyId: 'stats-test',
      secret,
      actor: 'reviewer@yawp.school',
    });
    expect(
      (
        await readTesterFeedbackScreenshot(
          new Request(url, { headers: wrongScope.headers }),
          feedbackId,
          deps
        )
      ).status
    ).toBe(403);

    const signedMissing = signInternalApiRequest({
      method: 'GET',
      url,
      keyId: 'feedback-test',
      secret,
      actor: 'reviewer@yawp.school',
    });
    expect(
      (
        await readTesterFeedbackScreenshot(
          new Request(url, { headers: signedMissing.headers }),
          feedbackId,
          deps
        )
      ).status
    ).toBe(404);
    expect(auditInternalRead).toHaveBeenCalledWith(
      expect.objectContaining({
        result: `screenshot.not_found:${feedbackId}`,
      })
    );
    auditInternalRead.mockClear();

    const signedEmpty = signInternalApiRequest({
      method: 'GET',
      url,
      keyId: 'feedback-test',
      secret,
      actor: 'reviewer@yawp.school',
    });
    loadScreenshot.mockResolvedValueOnce('');
    expect(
      (
        await readTesterFeedbackScreenshot(
          new Request(url, { headers: signedEmpty.headers }),
          feedbackId,
          deps
        )
      ).status
    ).toBe(404);

    const signedBadId = signInternalApiRequest({
      method: 'GET',
      url: url.replace(feedbackId, 'not-a-cuid'),
      keyId: 'feedback-test',
      secret,
      actor: 'reviewer@yawp.school',
    });
    expect(
      (
        await readTesterFeedbackScreenshot(
          new Request(url.replace(feedbackId, 'not-a-cuid'), {
            headers: signedBadId.headers,
          }),
          'not-a-cuid',
          deps
        )
      ).status
    ).toBe(400);
    expect(auditInternalRead).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'screenshot.invalid_id' })
    );
  });

  test('returns jpeg bytes, content-type, and audit row on success', async () => {
    const { authorizeInternalApiRequest, signInternalApiRequest, resetInternalApiMemoryNonceStore } =
      await import('~/utils/internal-platform-auth.server');
    resetInternalApiMemoryNonceStore();
    const auditInternalRead = mock(async () => {});
    const loadScreenshot = mock(async () => jpegDataUrl);
    const deps = {
      enabled: () => true,
      environment: () => 'demo',
      getUser: async () => null,
      save: async () => false,
      list: async () => [],
      authenticateInternal: authorizeInternalApiRequest,
      loadScreenshot,
      auditInternalRead,
    };
    const url = `https://yawp.test/api/internal/v1/tester-feedback/${feedbackId}/screenshot`;
    const signed = signInternalApiRequest({
      method: 'GET',
      url,
      keyId: 'feedback-test',
      secret,
      actor: 'reviewer@yawp.school',
    });
    const response = await readTesterFeedbackScreenshot(
      new Request(url, { headers: signed.headers }),
      feedbackId,
      deps
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpegBytes);
    expect(loadScreenshot).toHaveBeenCalledWith(feedbackId);
    expect(auditInternalRead).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: 'reviewer@yawp.school',
        keyId: 'feedback-test',
        endpoint: `GET /api/internal/v1/tester-feedback/${feedbackId}/screenshot`,
        result: `screenshot.success:${feedbackId}`,
        requestHash: expect.any(String),
      })
    );
  });
});
