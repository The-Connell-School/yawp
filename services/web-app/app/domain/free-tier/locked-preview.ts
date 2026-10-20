export const LOCKED_PREVIEW_PATH = '/app/free-tier/preview';
export const LOCKED_PREVIEW_MESSAGE =
  'Your classroom is ready to explore. Adding students and creating assignments will unlock as soon as your administrator approves.';

export function isLockedPreviewStatus(status: string) {
  return ['ACCOUNT_CREATED', 'ADMIN_SUBMITTED', 'SENT', 'MANUAL_REVIEW'].includes(status);
}

/** Explicit allowlist: new teaching routes are closed until reviewed. */
export function isLockedPreviewRequestAllowed(method: string, pathname: string) {
  if (['/app/free-tier/onboarding', '/app/free-tier/pending', '/auth/logout'].includes(pathname))
    return ['GET', 'HEAD', 'POST'].includes(method);
  // The action independently checks teacher identity, flags and preview-only intent.
  if (pathname === '/api/guided-tours') return method === 'POST';
  return ['GET', 'HEAD'].includes(method) &&
    [LOCKED_PREVIEW_PATH, '/app/free-tier/status'].includes(pathname);
}
