import type { FreeTierSignedLinkPurpose } from '@app/prisma';
import {
  applicationIdIfOpaqueHashVerified,
  peekSignedLink,
  type ConsumeLinkResult,
} from './signed-link.server';

/** S9a: show teacher/school names only when the token is fully verified (peek ok or opaque hash matches). */
export async function applicationIdForAdminLinkNaming(
  token: string,
  peek: ConsumeLinkResult,
  expectedPurpose: FreeTierSignedLinkPurpose
): Promise<string | null> {
  if (peek.ok) return peek.applicationId;
  if (peek.reason === 'invalid' || peek.reason === 'purpose_mismatch') {
    return null;
  }
  return applicationIdIfOpaqueHashVerified({ token, expectedPurpose });
}

/** Peek + S9a naming for terminal/deny gates before link consumption. */
export async function verifiedApplicationIdForAdminToken(
  token: string,
  expectedPurpose: FreeTierSignedLinkPurpose
): Promise<string | null> {
  const peek = await peekSignedLink({ token, expectedPurpose });
  return applicationIdForAdminLinkNaming(token, peek, expectedPurpose);
}
