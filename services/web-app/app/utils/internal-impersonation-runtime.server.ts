import type { MiddlewareFunction } from 'react-router';
import { basePrisma } from './db.server';
import { InternalImpersonationClient } from './internal-impersonation-client.server';
import { InternalImpersonationSessions } from './internal-impersonation-sessions.server';
import { createImpersonationHttp, hasImpersonationCookie } from './internal-impersonation-http.server';

const enabled = () => process.env.INTERNAL_IMPERSONATION_ENABLED === 'true';

export function impersonationHttp() {
  const origin = new URL(process.env.YAWP_PUBLIC_ORIGIN || '');
  const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(origin.hostname);
  if ((!local && origin.protocol !== 'https:') || origin.username || origin.password
    || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid Yawp public origin');
  const secrets = process.env.SESSION_SECRET?.split(',').filter(Boolean);
  if (!secrets?.length) throw new Error('Session signing secret is required');
  // Local termination must work even after the feature is disabled or the
  // upstream service is unavailable. The lifecycle records pending remote ends.
  const unavailable = async (): Promise<never> => { throw new Error('Internal impersonation unavailable'); };
  let remote: Pick<InternalImpersonationClient, 'redeem' | 'context' | 'end'> = {
    redeem: unavailable, context: unavailable, end: unavailable,
  };
  try {
    const key = process.env.YAWP_PRODUCTION_SERVICE_KEY || '';
    if (key === process.env.YAWP_MANAGEMENT_SERVICE_KEY) throw new Error('Distinct service credentials required');
    remote = new InternalImpersonationClient(process.env.INTERNAL_PLATFORM_ORIGIN || '', key);
  } catch { /* start/resolve fail closed; local end remains available */ }
  return createImpersonationHttp({
    origin: origin.origin, secrets, secure: !local, enabled,
    service: new InternalImpersonationSessions(basePrisma, remote),
    audit: async (identity, operation, action, path) => {
      await basePrisma.internalImpersonationEvent.create({ data: {
        sessionId: identity.id, actorId: identity.actorId, userId: identity.userId,
        organizationId: identity.organizationId, requestId: operation.requestId,
        requestAction: operation.action, action, resourceType: 'http', resourceId: path,
      } });
    },
  });
}

export const internalImpersonationMiddleware: MiddlewareFunction<Response> = async (args, next) => {
  if (!hasImpersonationCookie(args.request)) return next();
  // Never let missing/misconfigured integration fall through to ordinary auth.
  let http: ReturnType<typeof impersonationHttp>;
  try { http = impersonationHttp(); }
  catch { return new Response('Impersonation configuration unavailable', { status: 503, headers: { 'cache-control': 'no-store' } }); }
  return http.middleware(args, next);
};

export async function handoffPage() {
  if (!enabled()) throw new Response('Not found', { status: 404 });
  return impersonationHttp().page();
}
