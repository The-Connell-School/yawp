import type { KeyObject } from 'node:crypto';
import {
  fetchPlatformSigningKey,
  LtiSigningKeyNotFoundError,
  type LtiSigningKeyResolver,
} from './lti-contract.server';

type CacheEntry = {
  key?: KeyObject;
  error?: Error;
  expiresAt: number;
};

type RegistrationDocument = {
  keys: ReadonlyMap<string, KeyObject>;
  expiresAt: number;
  refreshNotBefore: number;
};

export function createLtiSigningKeyCache(
  options: {
    maxEntries?: number;
    now?: () => number;
    negativeTtlMs?: number;
    fetchSigningKey?: typeof fetchPlatformSigningKey;
  } = {}
) {
  const maxEntries = options.maxEntries ?? 128;
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error('LTI JWKS cache maxEntries must be a positive integer.');
  }
  const now = options.now ?? Date.now;
  const negativeTtlMs = options.negativeTtlMs ?? 15_000;
  if (
    !Number.isInteger(negativeTtlMs) ||
    negativeTtlMs < 1_000 ||
    negativeTtlMs > 60_000
  ) {
    throw new Error('LTI JWKS negative TTL must be between 1 and 60 seconds.');
  }
  const fetchSigningKey = options.fetchSigningKey ?? fetchPlatformSigningKey;
  const entries = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<KeyObject>>();
  const registrationFailures = new Map<string, CacheEntry>();
  const registrationInFlight = new Map<string, Promise<void>>();
  const registrationDocuments = new Map<string, RegistrationDocument>();

  const registrationKey = (input: Parameters<LtiSigningKeyResolver>[0]) =>
    [
      input.registration.id,
      input.registration.issuer,
      input.registration.jwksUrl,
    ].join('\0');

  const cacheKey = (input: Parameters<LtiSigningKeyResolver>[0]) =>
    [
      input.registration.id,
      input.registration.issuer,
      input.registration.jwksUrl,
      input.keyId,
    ].join('\0');

  const resolveSigningKey: LtiSigningKeyResolver = async (input) => {
    const id = cacheKey(input);
    const registrationId = registrationKey(input);
    const cached = entries.get(id);
    if (!input.forceRefresh && cached && cached.expiresAt > now()) {
      if (cached.key) return cached.key;
      throw (
        cached.error ?? new Error('LTI signing key is temporarily unavailable.')
      );
    }
    entries.delete(id);
    const document = registrationDocuments.get(registrationId);
    if (!input.forceRefresh && document && document.expiresAt > now()) {
      const documentKey = document.keys.get(input.keyId);
      if (documentKey) {
        entries.set(id, { key: documentKey, expiresAt: document.expiresAt });
        return documentKey;
      }
      if (document.refreshNotBefore > now()) {
        const error = new LtiSigningKeyNotFoundError(
          input.keyId,
          document.keys
        );
        entries.set(id, {
          error,
          expiresAt: document.refreshNotBefore,
        });
        throw error;
      }
    } else if (document) {
      registrationDocuments.delete(registrationId);
    }
    const registrationFailure = registrationFailures.get(registrationId);
    if (
      !input.forceRefresh &&
      registrationFailure &&
      registrationFailure.expiresAt > now()
    ) {
      throw (
        registrationFailure.error ??
        new Error('LTI signing keys are temporarily unavailable.')
      );
    }
    registrationFailures.delete(registrationId);
    const existingRequest = inFlight.get(id);
    if (existingRequest) return existingRequest;
    const existingRegistrationRequest =
      registrationInFlight.get(registrationId);
    if (existingRegistrationRequest) {
      await existingRegistrationRequest;
      return resolveSigningKey(input);
    }

    const request = (async () => {
      try {
        const key = await fetchSigningKey(
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
        const existingDocument = registrationDocuments.get(registrationId);
        registrationDocuments.set(registrationId, {
          keys: new Map([
            ...(existingDocument?.keys.entries() ?? []),
            [input.keyId, key],
          ]),
          expiresAt: now() + input.registration.jwksCacheTtlSeconds * 1000,
          refreshNotBefore: now(),
        });
        registrationFailures.delete(registrationId);
        return key;
      } catch (error) {
        const safeError =
          error instanceof Error
            ? error
            : new Error('LTI signing key lookup failed.');
        while (entries.size >= maxEntries) {
          const oldest = entries.keys().next().value;
          if (oldest === undefined) break;
          entries.delete(oldest);
        }
        entries.set(id, {
          error: safeError,
          expiresAt: now() + negativeTtlMs,
        });
        if (safeError instanceof LtiSigningKeyNotFoundError) {
          registrationDocuments.set(registrationId, {
            keys: safeError.availableKeys,
            expiresAt: now() + input.registration.jwksCacheTtlSeconds * 1000,
            refreshNotBefore: now() + negativeTtlMs,
          });
        } else {
          registrationFailures.set(registrationId, {
            error: safeError,
            expiresAt: now() + negativeTtlMs,
          });
        }
        throw safeError;
      } finally {
        inFlight.delete(id);
        registrationInFlight.delete(registrationId);
      }
    })();
    inFlight.set(id, request);
    registrationInFlight.set(
      registrationId,
      request.then(
        () => undefined,
        () => undefined
      )
    );
    return request;
  };

  return {
    resolveSigningKey,
    clearRegistration(registrationId: string) {
      for (const id of entries.keys()) {
        if (id.startsWith(`${registrationId}\0`)) entries.delete(id);
      }
      for (const id of registrationFailures.keys()) {
        if (id.startsWith(`${registrationId}\0`)) {
          registrationFailures.delete(id);
        }
      }
      for (const id of registrationDocuments.keys()) {
        if (id.startsWith(`${registrationId}\0`)) {
          registrationDocuments.delete(id);
        }
      }
    },
    get size() {
      return entries.size;
    },
    get inFlightSize() {
      return inFlight.size;
    },
  };
}
