import { getImpersonationAttribution } from '~/utils/internal-impersonation-context.server';
import { createCookie } from 'react-router';
import { shouldUseSecureCookies } from '~/utils/cookie-security.server';

const cookieName = 'membership-id';
const MEMBERSHIP_ID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const membershipIdCookie = createCookie(cookieName, {
  path: '/',
  httpOnly: true,
  secure: shouldUseSecureCookies(),
  sameSite: 'lax',
  secrets: process.env.SESSION_SECRET.split(','),
});

export function destroyMembershipId() {
  return membershipIdCookie.serialize('', { maxAge: -1 });
}

export async function getMembershipId(request: Request): Promise<string> {
  const internal = getImpersonationAttribution();
  if (internal) return internal.membershipId;
  const rawCookie = request.headers.get('cookie');
  const membershipId = rawCookie
    ? await membershipIdCookie.parse(rawCookie)
    : null;
  return membershipId;
}

export async function setMembershipId(membershipId: string) {
  if (!membershipId) return destroyMembershipId();

  return membershipIdCookie.serialize(membershipId, {
    maxAge: MEMBERSHIP_ID_COOKIE_MAX_AGE_SECONDS,
  });
}
