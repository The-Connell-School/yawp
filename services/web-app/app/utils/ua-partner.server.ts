import { createCookie, type MiddlewareFunction } from 'react-router';
import { shouldUseSecureCookies } from './cookie-security.server';

// Chromium caps persistent cookies at 400 days. Refreshing this cookie whenever
// a partner code is accepted gives the UA entry context the closest practical
// equivalent to "remember this indefinitely" without making it an auth token.
const UA_PARTNER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

const uaPartnerCookie = createCookie('yawp_partner', {
  httpOnly: true,
  maxAge: UA_PARTNER_COOKIE_MAX_AGE_SECONDS,
  path: '/',
  sameSite: 'lax',
  secrets: process.env.SESSION_SECRET.split(','),
  secure: shouldUseSecureCookies(),
});

export type UaPartnerContext = { partner: 'ua' };

function configuredUaPartnerHostname() {
  const hostname = process.env.UA_PARTNER_HOSTNAME?.trim().toLowerCase();
  if (!hostname || hostname.includes('/') || hostname.includes(':'))
    return null;
  return hostname;
}

export function isUaPartnerHost(request: Request) {
  const configured = configuredUaPartnerHostname();
  if (!configured) return false;
  return new URL(request.url).hostname.toLowerCase() === configured;
}

export function getCanonicalUaUrl(request: Request, pathname: string) {
  if (isUaPartnerHost(request)) return null;
  const hostname = configuredUaPartnerHostname();
  if (!hostname || !pathname.startsWith('/')) return null;

  const target = new URL(request.url);
  target.hostname = hostname;
  if (target.protocol === 'https:') target.port = '';
  target.pathname = pathname;
  return target.toString();
}

export function createUaPartnerMiddleware(): MiddlewareFunction<Response> {
  return async ({ request }, next) => {
    if (request.method !== 'GET' || !isUaPartnerHost(request)) return next();

    const capture = getUaPartnerCodeCapture(request);
    if (!capture) return next();

    let location = capture.redirectTo;
    if (!capture.accepted) {
      const cleaned = new URL(capture.redirectTo, request.url);
      cleaned.searchParams.set('codeError', '1');
      location = `${cleaned.pathname}${cleaned.search}`;
    }

    return new Response(null, {
      status: 303,
      headers: {
        'Cache-Control': 'no-store',
        Location: location,
        ...(capture.accepted
          ? { 'set-cookie': await commitUaPartnerContext() }
          : {}),
      },
    });
  };
}

export const uaPartnerMiddleware = createUaPartnerMiddleware();

export function isUaStudentBillingEnabled() {
  return (
    process.env.UA_STUDENT_BILLING_ENABLED === 'true' &&
    Boolean(process.env.UA_ORGANIZATION_ID) &&
    Boolean(process.env.UA_PARTNER_CODE?.trim())
  );
}

function normalizePartnerCode(value: string) {
  return value.trim().toLocaleLowerCase('en-US');
}

export function isValidUaPartnerCode(value: string | null | undefined) {
  const configured = process.env.UA_PARTNER_CODE?.trim();
  return Boolean(
    configured &&
    value &&
    normalizePartnerCode(value) === normalizePartnerCode(configured)
  );
}

export function getUaPartnerCodeCapture(request: Request) {
  const url = new URL(request.url);
  const parameterName = url.searchParams.has('organizationCode')
    ? 'organizationCode'
    : url.searchParams.has('code') &&
        ['/', '/ua', '/ua/sign-in', '/ua/sign-up'].includes(url.pathname)
      ? 'code'
      : null;
  if (!parameterName) return null;

  const accepted = isValidUaPartnerCode(url.searchParams.get(parameterName));
  url.searchParams.delete('organizationCode');
  url.searchParams.delete('code');

  return {
    accepted,
    redirectTo: `${url.pathname}${url.search}`,
  };
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
