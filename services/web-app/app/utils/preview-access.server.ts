import { timingSafeEqual } from 'node:crypto';
import { createCookie, type MiddlewareFunction } from 'react-router';
import { shouldUseSecureCookies } from './cookie-security.server';

export const PREVIEW_ACCESS_COOKIE_NAME = '__yawp_preview_access';
export const PREVIEW_ACCESS_PATH = '/auth/preview-access';
export const PREVIEW_ACCESS_MAX_AGE = 60 * 60 * 24 * 30;

const ACCESS_GRANTED_VALUE = 'granted-v1';
const ACCESS_CODE_PATTERN = /^[a-z]+-[a-z]+-[1-9][0-9]{3}$/;
const OPEN_PATHS = new Set([
  '/api/healthcheck',
  PREVIEW_ACCESS_PATH,
  `${PREVIEW_ACCESS_PATH}.data`,
]);

function normalizeCode(value: string) {
  return value.trim().toLowerCase();
}

function configuredCodes() {
  return String(process.env.PREVIEW_ACCESS_CODES ?? '')
    .split(/[;,\n]/)
    .map(normalizeCode)
    .filter((code) => ACCESS_CODE_PATTERN.test(code));
}

function sessionSecrets() {
  return String(process.env.SESSION_SECRET ?? '')
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean);
}

export function isPreviewAccessGateEnabled() {
  return process.env.PREVIEW_ACCESS_GATE === 'on';
}

export function isPreviewAccessConfigured() {
  return configuredCodes().length > 0 && sessionSecrets().length > 0;
}

export function validatePreviewAccessCode(value: string) {
  const candidate = normalizeCode(value);
  if (!ACCESS_CODE_PATTERN.test(candidate)) return false;

  return configuredCodes().some((configured) => {
    const candidateBytes = Buffer.from(candidate);
    const configuredBytes = Buffer.from(configured);
    return (
      candidateBytes.length === configuredBytes.length &&
      timingSafeEqual(candidateBytes, configuredBytes)
    );
  });
}

export function createPreviewAccessCookie() {
  const secrets = sessionSecrets();
  return createCookie(PREVIEW_ACCESS_COOKIE_NAME, {
    httpOnly: true,
    maxAge: PREVIEW_ACCESS_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secrets: secrets.length > 0 ? secrets : ['preview-access-unconfigured'],
    secure: shouldUseSecureCookies(),
  });
}

export async function grantPreviewAccessCookie() {
  if (!isPreviewAccessConfigured()) {
    throw new Error('Preview access gate is not configured.');
  }
  return createPreviewAccessCookie().serialize(ACCESS_GRANTED_VALUE);
}

export async function clearPreviewAccessCookie() {
  return createPreviewAccessCookie().serialize('', { maxAge: 0 });
}

export async function hasPreviewAccess(request: Request) {
  if (!isPreviewAccessConfigured()) return false;
  const value = await createPreviewAccessCookie().parse(
    request.headers.get('cookie'),
  );
  return value === ACCESS_GRANTED_VALUE;
}

function blockedResponse(request: Request) {
  const url = new URL(request.url);
  const isReadRequest = request.method === 'GET' || request.method === 'HEAD';

  if (!isReadRequest || url.pathname.startsWith('/api/')) {
    return Response.json(
      { error: 'Preview access code required.' },
      {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  const returnTo = `${url.pathname}${url.search}`;
  const search = new URLSearchParams({ returnTo });
  return new Response(null, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store',
      Location: `${PREVIEW_ACCESS_PATH}?${search}`,
    },
  });
}

/**
 * The preview access flag and this request-boundary middleware are the same switch.
 * Therefore PREVIEW_ACCESS_GATE=on cannot expose role-swap without also putting the
 * gate in front of every descendant loader, action, and resource/API route.
 */
export const previewAccessMiddleware: MiddlewareFunction<Response> = async (
  { request },
  next,
) => {
  if (!isPreviewAccessGateEnabled()) return next();

  const pathname = new URL(request.url).pathname;
  if (OPEN_PATHS.has(pathname)) return next();
  if (await hasPreviewAccess(request)) return next();

  return blockedResponse(request);
};
