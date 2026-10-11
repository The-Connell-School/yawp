import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  authorizeInternalApiRequest,
  buildInternalApiSignatureBaseString,
  legacyInternalKeyAllowed,
  resetInternalApiMemoryNonceStore,
  signInternalApiRequest,
} from './internal-platform-auth.server';

const managementKey =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01';
const secret = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
const keyConfig = JSON.stringify([
  {
    id: 'primary',
    secret,
    scopes: ['rubrics:read', 'flags:read', 'stats:read'],
  },
  {
    id: 'secondary',
    secret: `${secret}-secondary-rotation-key-material`,
    scopes: ['rubrics:write', 'flags:write', 'stats:read'],
  },
]);

function signedRequest(input: {
  method: string;
  url: string;
  body?: string;
  keyId?: string;
  scopes?: string[];
  skewSeconds?: number;
  badSignature?: boolean;
}) {
  const keyId = input.keyId ?? 'primary';
  const signed = signInternalApiRequest({
    method: input.method,
    url: input.url,
    body: input.body ?? '',
    keyId,
    secret: keyId === 'primary' ? secret : `${secret}-secondary-rotation-key-material`,
    actor: 'operator@yawp.school',
    timestamp: String(
      Math.floor(Date.now() / 1000) + (input.skewSeconds ?? 0)
    ),
  });
  const headers = new Headers(signed.headers);
  if (input.badSignature) {
    headers.set('X-Yawp-Signature', 'invalid-signature-value');
  }
  return new Request(input.url, {
    method: input.method,
    headers,
    body: input.body,
  });
}

describe('internal-platform-auth', () => {
  const saved = {
    keys: process.env.YAWP_INTERNAL_API_KEYS,
    management: process.env.YAWP_MANAGEMENT_SERVICE_KEY,
    legacy: process.env.LEGACY_INTERNAL_KEY_ALLOWED,
  };

  beforeEach(() => {
    resetInternalApiMemoryNonceStore();
    process.env.INTERNAL_API_NONCE_STORE = 'memory';
    process.env.YAWP_INTERNAL_API_KEYS = keyConfig;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = managementKey;
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'true';
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_NONCE_STORE;
    process.env.YAWP_INTERNAL_API_KEYS = saved.keys;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = saved.management;
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = saved.legacy;
    resetInternalApiMemoryNonceStore();
  });

  test('legacy bearer remains allowed by default', async () => {
    const response = await authorizeInternalApiRequest(
      new Request('https://yawp.test/api/internal/v1/users', {
        headers: { authorization: `Bearer ${managementKey}` },
      })
    );
    expect(response instanceof Response).toBe(false);
  });

  test('rejects unsigned requests when legacy is disabled', async () => {
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'false';
    const response = await authorizeInternalApiRequest(
      new Request('https://yawp.test/api/internal/v1/rubric-catalog')
    );
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
  });

  test('rejects bad signatures, expired timestamps, replayed nonces, and wrong scopes', async () => {
    const url = 'https://yawp.test/api/internal/v1/rubric-catalog';
    const bad = await authorizeInternalApiRequest(
      signedRequest({ method: 'GET', url, badSignature: true })
    );
    expect((bad as Response).status).toBe(401);

    const expired = await authorizeInternalApiRequest(
      signedRequest({ method: 'GET', url, skewSeconds: -360 })
    );
    expect((expired as Response).status).toBe(401);

    const signed = signInternalApiRequest({
      method: 'GET',
      url,
      keyId: 'primary',
      secret,
      actor: 'operator@yawp.school',
    });
    const headers = new Headers(signed.headers);
    const ok = await authorizeInternalApiRequest(
      new Request(url, { method: 'GET', headers })
    );
    expect(ok instanceof Response).toBe(false);

    const replay = await authorizeInternalApiRequest(
      new Request(url, { method: 'GET', headers })
    );
    expect((replay as Response).status).toBe(401);

    const body = '{"enabled":true}';
    const wrongScope = await authorizeInternalApiRequest(
      signedRequest({
        method: 'POST',
        url: 'https://yawp.test/api/internal/v1/feature-flags/demo_flag',
        body,
        keyId: 'primary',
      }),
      { requiredScope: 'flags:write', body }
    );
    expect((wrongScope as Response).status).toBe(403);
  });

  test('signature base string matches the documented shape', () => {
    const base = buildInternalApiSignatureBaseString({
      method: 'POST',
      pathname: '/api/internal/v1/rubrics',
      search: 'name=demo',
      timestamp: '1700000000',
      nonce: 'nonce-1',
      actor: 'Operator@Yawp.School',
      body: '{"schema":{}}',
    });
    expect(base.split('\n')[0]).toBe('POST');
    expect(base).toContain('operator@yawp.school');
    expect(base.split('\n').length).toBe(7);
  });

  test('legacyInternalKeyAllowed defaults to true', () => {
    delete process.env.LEGACY_INTERNAL_KEY_ALLOWED;
    expect(legacyInternalKeyAllowed()).toBe(true);
    process.env.LEGACY_INTERNAL_KEY_ALLOWED = 'false';
    expect(legacyInternalKeyAllowed()).toBe(false);
  });
});
