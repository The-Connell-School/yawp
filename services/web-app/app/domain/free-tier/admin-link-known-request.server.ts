import type { FreeTierSignedLinkPurpose } from '@app/prisma';
import {
  applicationIdIfOpaqueHashVerified,
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
