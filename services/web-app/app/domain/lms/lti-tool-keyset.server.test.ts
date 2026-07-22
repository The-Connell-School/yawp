import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, test } from 'bun:test';
import {
  getActiveLtiToolSigningKey,
  getLtiToolJwks,
  resetLtiToolSigningKeyCacheForTests,
} from './lti-tool-keyset.server';

function rsaPem(modulusLength = 2048) {
  return generateKeyPairSync('rsa', { modulusLength }).privateKey.export({
    format: 'pem',
    type: 'pkcs8',
  }) as string;
}

afterEach(resetLtiToolSigningKeyCacheForTests);

describe('LTI tool signing keyset', () => {
  test('selects the active key and publishes public-only rotation JWKS', () => {
    const raw = JSON.stringify({
      activeKeyId: 'v2',
      keys: [
        { keyId: 'v1', privateKeyPem: rsaPem() },
        { keyId: 'v2', privateKeyPem: rsaPem() },
      ],
    });

    expect(getActiveLtiToolSigningKey(raw).keyId).toBe('v2');
    const jwks = getLtiToolJwks(raw);
    expect(jwks.keys.map((key) => key.kid)).toEqual(['v2', 'v1']);
    expect(jwks.keys.every((key) => key.kty === 'RSA')).toBe(true);
    expect(JSON.stringify(jwks)).not.toContain('PRIVATE KEY');
  });

  test('rejects missing, duplicate, inactive, non-RSA, and weak keys', () => {
    expect(() => getLtiToolJwks('')).toThrow('not configured');
    const valid = rsaPem();
    expect(() =>
      getLtiToolJwks(
        JSON.stringify({
          activeKeyId: 'missing',
          keys: [{ keyId: 'v1', privateKeyPem: valid }],
        })
      )
    ).toThrow('active');
    expect(() =>
      getLtiToolJwks(
        JSON.stringify({
          activeKeyId: 'v1',
          keys: [
            { keyId: 'v1', privateKeyPem: valid },
            { keyId: 'v1', privateKeyPem: valid },
          ],
        })
      )
    ).toThrow('unique');
    expect(() =>
      getLtiToolJwks(
        JSON.stringify({
          activeKeyId: 'weak',
          keys: [{ keyId: 'weak', privateKeyPem: rsaPem(1024) }],
        })
      )
    ).toThrow('2048-bit');
  });
});
