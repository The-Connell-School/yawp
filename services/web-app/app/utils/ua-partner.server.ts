import { createCookie } from 'react-router';
import { shouldUseSecureCookies } from './cookie-security.server';

const UA_PARTNER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 2;

const uaPartnerCookie = createCookie('yawp_partner', {
  httpOnly: true,
  maxAge: UA_PARTNER_COOKIE_MAX_AGE_SECONDS,
  path: '/',
  sameSite: 'lax',
  secrets: process.env.SESSION_SECRET.split(','),
  secure: shouldUseSecureCookies(),
});

export type UaPartnerContext = { partner: 'ua' };

export function isUaStudentBillingEnabled() {
  return (
    process.env.UA_STUDENT_BILLING_ENABLED === 'true' &&
    Boolean(process.env.UA_ORGANIZATION_ID)
  );
}

export function requireUaOrganizationId() {
  if (!isUaStudentBillingEnabled()) {
    throw new Response('University partner enrollment is not configured.', {
      status: 404,
    });
  }

  return process.env.UA_ORGANIZATION_ID!;
}

export async function commitUaPartnerContext() {
  return uaPartnerCookie.serialize({
    partner: 'ua',
  } satisfies UaPartnerContext);
}

export async function destroyUaPartnerContext(request: Request) {
  return uaPartnerCookie.serialize('', {
    expires: new Date(0),
    maxAge: 0,
  });
}

export async function getUaPartnerContext(
  request: Request
): Promise<UaPartnerContext | null> {
  const value = await uaPartnerCookie.parse(request.headers.get('cookie'));
  return value?.partner === 'ua' ? { partner: 'ua' } : null;
}
