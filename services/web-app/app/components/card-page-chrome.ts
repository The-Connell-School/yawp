import { safeRedirect } from 'remix-utils/safe-redirect';

/** Routes that receive Option A page chrome (logo + back link + unsaved-form guard). */
export function pathnameUsesCardPageChrome(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path === '/auth/login') return true;
  if (path.startsWith('/auth/inv/')) return true;
  if (path === '/auth/required-password-change') return true;
  if (path === '/free' || path.startsWith('/free/')) return true;
  if (
    path === '/app/free-tier/onboarding' ||
    path.startsWith('/app/free-tier/onboarding/')
  ) {
    return true;
  }
  if (path === '/app/free-tier/pending' || path === '/app/free-tier/status') {
    return true;
  }
  return false;
}

export function isAdminApprovalCardPage(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return path.startsWith('/free/admin/');
}

export function shouldShowCardPageBackLink(
  pathname: string,
  isSignedIn: boolean
): boolean {
  if (!pathnameUsesCardPageChrome(pathname)) return false;
  if (isSignedIn) return false;
  const path = normalizePathname(pathname);
  if (path === '/auth/login') return false;
  if (isAdminApprovalCardPage(path)) return false;
  return true;
}

export function cardPageLogoHref(isSignedIn: boolean, publicSiteOrigin: string) {
  return isSignedIn ? '/app' : publicSiteOrigin;
}

/** Preserves safe `redirectTo`; drops unsafe values entirely. */
export function backToSignInHref(rawRedirectTo: string | null | undefined) {
  const raw = rawRedirectTo?.trim();
  if (!raw) return '/auth/login';
  const safe = safeRedirect(raw, '');
  if (!safe) return '/auth/login';
  const params = new URLSearchParams({ redirectTo: safe });
  return `/auth/login?${params.toString()}`;
}

function normalizePathname(pathname: string) {
  if (!pathname || pathname === '/') return pathname || '/';
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/** Documented card pages wrapped by {@link AuthPageShell} chrome (for PR / release notes). */
export const CARD_PAGE_CHROME_ROUTES = [
  '/auth/login',
  '/auth/inv/signup',
  '/auth/inv/onboard-owner',
  '/auth/inv/onboard-student',
  '/auth/inv/onboard-teacher',
  '/auth/inv/verify',
  '/auth/inv/forgot-password',
  '/auth/inv/forgot-password-reset',
  '/auth/required-password-change',
  '/free',
  '/free/join',
  '/free/admin/approve',
  '/free/admin/approve/deny',
  '/free/admin/not-right-person',
  '/app/free-tier/onboarding',
  '/app/free-tier/pending',
  '/app/free-tier/status',
] as const;
