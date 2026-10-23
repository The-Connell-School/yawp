import { afterAll, beforeAll, expect, mock, test } from 'bun:test';

const realSignedLink =
  globalThis.__realModules['~/domain/free-tier/signed-link.server'];

let applicationIdForKnownRequestOnFailedPeek: typeof import('./admin-link-known-request.server').applicationIdForKnownRequestOnFailedPeek;
let REQUIRE_OPAQUE_HASH_FOR_KNOWN_REQUEST_LOOKUP: typeof import('./admin-link-known-request.server').REQUIRE_OPAQUE_HASH_FOR_KNOWN_REQUEST_LOOKUP;

function restoreRealSignedLinkModule() {
  if (realSignedLink) {
    mock.module('~/domain/free-tier/signed-link.server', () => realSignedLink);
  }
}

beforeAll(async () => {
  restoreRealSignedLinkModule();
  const mod = await import('./admin-link-known-request.server');
  applicationIdForKnownRequestOnFailedPeek =
    mod.applicationIdForKnownRequestOnFailedPeek;
  REQUIRE_OPAQUE_HASH_FOR_KNOWN_REQUEST_LOOKUP =
    mod.REQUIRE_OPAQUE_HASH_FOR_KNOWN_REQUEST_LOOKUP;
});

afterAll(() => {
  restoreRealSignedLinkModule();
});

test('known-request lookup switch defaults off (structural decode allowed)', () => {
  expect(REQUIRE_OPAQUE_HASH_FOR_KNOWN_REQUEST_LOOKUP).toBe(false);
});

test('forged and unsigned peeks do not resolve an application id', () => {
  expect(
    applicationIdForKnownRequestOnFailedPeek('not-a-token', {
      ok: false,
      reason: 'invalid',
    })
  ).toBeNull();
  expect(
    applicationIdForKnownRequestOnFailedPeek('a.b', {
      ok: false,
      reason: 'invalid',
    })
  ).toBeNull();
});
