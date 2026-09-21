import { hasImpersonationCookie } from './internal-impersonation-http.server';

// Neither the thrown exception nor request metadata may reach legacy logging or
// analytics for this boundary. Errors can contain serialized credentials/URLs.
export function reportImpersonationError(request: Request, report: (entry: { event: string }) => void): boolean {
  const path = new URL(request.url).pathname;
  if (!hasImpersonationCookie(request) && path !== '/auth/internal-impersonation' && !path.startsWith('/api/internal/')) return false;
  report({ event: 'internal_impersonation_request_failed' });
  return true;
}
