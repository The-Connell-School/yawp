export const LOCKED_PREVIEW_PATH = '/app/free-tier/preview';
export const LOCKED_PREVIEW_APP_HOME = '/app';
export const LOCKED_PREVIEW_MESSAGE =
  'Your classroom is ready to explore. Adding students and creating assignments will unlock as soon as your administrator approves.';

export function isLockedPreviewStatus(status: string) {
  return ['ACCOUNT_CREATED', 'ADMIN_SUBMITTED', 'SENT', 'MANUAL_REVIEW'].includes(status);
}

function isLockedPreviewBrowsePath(method: string, pathname: string) {
  if (!['GET', 'HEAD'].includes(method)) return false;
  if (pathname === '/app' || pathname.startsWith('/app/')) return true;
  if (pathname.startsWith('/api/image/')) return true;
  return false;
}

/** Explicit allowlist: teaching writes stay closed until approval; app reads are open. */
export function isLockedPreviewRequestAllowed(method: string, pathname: string) {
  if (isLockedPreviewBrowsePath(method, pathname)) return true;
  if (['/app/free-tier/onboarding', '/app/free-tier/pending', '/auth/logout'].includes(pathname))
    return method === 'POST';
  // The action independently checks teacher identity, flags and preview-only intent.
  if (pathname === '/api/guided-tours') return method === 'POST';
  // Full-page teaching forms handle approval_required inline in their actions.
  if (pathname === '/app/assignments/new') return method === 'POST';
  return false;
}
