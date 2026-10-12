import { createHash, randomBytes } from 'node:crypto';
import { createCookie } from 'react-router';
import { shouldUseSecureCookies } from '~/utils/cookie-security.server';

export const FREE_TIER_SCAN_DEDUPE_COOKIE = '__yawp_ft_scan';
export const FREE_TIER_SCAN_DEDUPE_MS = 10 * 60 * 1000;

const scanCookie = createCookie(FREE_TIER_SCAN_DEDUPE_COOKIE, {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  secure: shouldUseSecureCookies(),
});

export function hashScanDedupeCookie(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function coarseUserAgent(userAgent: string | null) {
  if (!userAgent) return null;
  const trimmed = userAgent.trim().slice(0, 120);
  return trimmed || null;
}

export async function readOrMintScanDedupeCookie(request: Request) {
  const existing = await scanCookie.parse(request.headers.get('cookie'));
  if (typeof existing === 'string' && existing.length >= 16 && existing.length <= 64) {
    return { value: existing, setCookie: null as string | null };
  }
  const value = randomBytes(18).toString('base64url');
  const setCookie = await scanCookie.serialize(value);
  return { value, setCookie };
}
