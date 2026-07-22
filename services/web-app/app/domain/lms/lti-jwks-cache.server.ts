import type { KeyObject } from 'node:crypto';
import {
  fetchPlatformSigningKey,
  type LtiSigningKeyResolver,
} from './lti-contract.server';

type CacheEntry = {
  key: KeyObject;
  expiresAt: number;
};

export function createLtiSigningKeyCache(
  options: {
    maxEntries?: number;
    now?: () => number;
  } = {}
) {
  const maxEntries = options.maxEntries ?? 128;
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error('LTI JWKS cache maxEntries must be a positive integer.');
  }
  const now = options.now ?? Date.now;
  const entries = new Map<string, CacheEntry>();

  const cacheKey = (input: Parameters<LtiSigningKeyResolver>[0]) =>
    [
      input.registration.id,
      input.registration.issuer,
      input.registration.jwksUrl,
      input.keyId,
    ].join('\0');

  const resolveSigningKey: LtiSigningKeyResolver = async (input) => {
    const id = cacheKey(input);
    const cached = entries.get(id);
    if (!input.forceRefresh && cached && cached.expiresAt > now()) {
      return cached.key;
    }
    entries.delete(id);
    const key = await fetchPlatformSigningKey(
      input.registration,
      input.keyId,
      input.timeoutMs
    );
    while (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
    entries.set(id, {
      key,
      expiresAt: now() + input.registration.jwksCacheTtlSeconds * 1000,
    });
    return key;
  };

  return {
    resolveSigningKey,
    clearRegistration(registrationId: string) {
      for (const id of entries.keys()) {
        if (id.startsWith(`${registrationId}\0`)) entries.delete(id);
      }
    },
    get size() {
      return entries.size;
    },
  };
}
