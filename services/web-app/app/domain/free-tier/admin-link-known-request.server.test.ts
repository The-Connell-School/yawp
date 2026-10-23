import { expect, test } from 'bun:test';
import {
  REQUIRE_OPAQUE_HASH_FOR_KNOWN_REQUEST_LOOKUP,
  applicationIdForKnownRequestOnFailedPeek,
} from './admin-link-known-request.server';

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
