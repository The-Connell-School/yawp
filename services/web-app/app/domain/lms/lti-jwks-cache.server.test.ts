import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { LtiSigningKeyNotFoundError } from './lti-contract.server';
import { createLtiSigningKeyCache } from './lti-jwks-cache.server';
import type { LtiRegistration } from './lti-registration';

const registration = {
  id: 'registration-a',
  issuer: 'https://lms.example.test',
  jwksUrl: 'https://lms.example.test/jwks',
  jwksCacheTtlSeconds: 300,
} as LtiRegistration;

function input(forceRefresh = false, keyId = 'kid-a') {
  return {
    registration,
    keyId,
    forceRefresh,
  };
}

describe('LTI JWKS cache abuse controls', () => {
  test('singleflights concurrent lookups for the same registration and kid', async () => {
    const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
    let calls = 0;
    let release!: (value: KeyObject) => void;
    const pendingKey = new Promise<KeyObject>((resolve) => (release = resolve));
    const cache = createLtiSigningKeyCache({
      fetchSigningKey: async () => {
        calls += 1;
        return pendingKey;
      },
    });
    const lookups = [
      cache.resolveSigningKey(input()),
      cache.resolveSigningKey(input()),
      cache.resolveSigningKey(input()),
    ];
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(cache.inFlightSize).toBe(1);
    release(key);
    expect(await Promise.all(lookups)).toEqual([key, key, key]);
    expect(cache.inFlightSize).toBe(0);
  });

  test('negative-caches a missing kid briefly and permits explicit refresh', async () => {
    let calls = 0;
    const cache = createLtiSigningKeyCache({
      negativeTtlMs: 10_000,
      fetchSigningKey: async () => {
        calls += 1;
        throw new Error('missing signing key');
      },
    });
    await expect(cache.resolveSigningKey(input())).rejects.toThrow('missing');
    await expect(cache.resolveSigningKey(input())).rejects.toThrow('missing');
    expect(calls).toBe(1);
    await expect(cache.resolveSigningKey(input(true))).rejects.toThrow(
      'missing'
    );
    expect(calls).toBe(2);
  });

  test('singleflights distinct missing kids behind one registration failure window', async () => {
    let calls = 0;
    const cache = createLtiSigningKeyCache({
      negativeTtlMs: 10_000,
      fetchSigningKey: async (_registration, keyId) => {
        calls += 1;
        await Promise.resolve();
        throw new LtiSigningKeyNotFoundError(keyId, new Map());
      },
    });
    const results = await Promise.allSettled([
      cache.resolveSigningKey(input(false, 'attacker-kid-a')),
      cache.resolveSigningKey(input(false, 'attacker-kid-b')),
      cache.resolveSigningKey(input(false, 'attacker-kid-c')),
    ]);
    expect(results.every(({ status }) => status === 'rejected')).toBe(true);
    expect(calls).toBe(1);
  });

  test('an unknown attacker kid cannot poison a published key from the same JWKS', async () => {
    const legitimateKey = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    }).publicKey;
    let calls = 0;
    const cache = createLtiSigningKeyCache({
      negativeTtlMs: 10_000,
      fetchSigningKey: async (_registration, keyId) => {
        calls += 1;
        if (keyId === 'attacker-kid') {
          throw new LtiSigningKeyNotFoundError(
            keyId,
            new Map([['published-kid', legitimateKey]])
          );
        }
        return legitimateKey;
      },
    });
    await expect(
      cache.resolveSigningKey(input(false, 'attacker-kid'))
    ).rejects.toBeInstanceOf(LtiSigningKeyNotFoundError);
    await expect(
      cache.resolveSigningKey(input(false, 'published-kid'))
    ).resolves.toBe(legitimateKey);
    expect(calls).toBe(1);
  });
});
