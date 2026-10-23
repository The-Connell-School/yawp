import {
  applicationIdFromSignedToken,
  type ConsumeLinkResult,
} from './signed-link.server';

/** Flip to true to stop naming teachers on invalid links unless peek validates the opaque segment. */
export const REQUIRE_OPAQUE_HASH_FOR_KNOWN_REQUEST_LOOKUP = false;

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
