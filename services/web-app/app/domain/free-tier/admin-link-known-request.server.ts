import {
  applicationIdFromSignedToken,
  type ConsumeLinkResult,
} from './signed-link.server';

/** S9a: name teachers on invalid links only when peek fully validates the token. */
export const REQUIRE_OPAQUE_HASH_FOR_KNOWN_REQUEST_LOOKUP = true;

export function applicationIdForKnownRequestOnFailedPeek(
  token: string,
  peek: Extract<ConsumeLinkResult, { ok: false }>
): string | null {
  if (peek.reason !== 'invalid' && peek.reason !== 'purpose_mismatch') {
    return null;
  }
  if (REQUIRE_OPAQUE_HASH_FOR_KNOWN_REQUEST_LOOKUP) {
    return null;
  }
  return applicationIdFromSignedToken(token);
}
