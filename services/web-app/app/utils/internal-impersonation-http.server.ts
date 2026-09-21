import { randomBytes, randomUUID } from 'node:crypto';
import { createCookie, type MiddlewareFunction } from 'react-router';
import type { InternalImpersonationSessions } from './internal-impersonation-sessions.server';
import type { ImpersonationAttribution, ImpersonationOperation } from './internal-impersonation-writes.server';
import { runWithImpersonation } from './internal-impersonation-context.server';

export const impersonationCookieName = 'yawp_internal_impersonation';
const entry = '/auth/internal-impersonation';
export const hasImpersonationCookie = (request: Request) => (request.headers.get('cookie') || '').split(';').some(value => value.trim().startsWith(`${impersonationCookieName}=`));
const json = (body: unknown, status = 200, headers = new Headers()) => {
  headers.set('cache-control', 'no-store');
  headers.set('referrer-policy', 'no-referrer');
  return Response.json(body, { status, headers });
};

export function createImpersonationHttp(options: {
  origin: string; secrets: string[]; secure: boolean; enabled: () => boolean;
  service: Pick<InternalImpersonationSessions, 'start' | 'resolve' | 'end'>;
  audit: (identity: ImpersonationAttribution, operation: ImpersonationOperation, action: string, path: string) => Promise<void>;
}) {
  const origin = new URL(options.origin).origin;
  const cookieOptions = { secrets: options.secrets, secure: options.secure, httpOnly: true, path: '/', sameSite: 'strict' as const };
  const cookie = createCookie(impersonationCookieName, cookieOptions);
  const csrfCookie = createCookie('yawp_internal_handoff', { ...cookieOptions, maxAge: 300 });
  const ordinaryCookie = createCookie('en_session', cookieOptions);
  const membershipCookie = createCookie('membership-id', cookieOptions);
  const parse = async (request: Request) => {
    try { const value = await cookie.parse(request.headers.get('cookie')); return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null; }
    catch { return null; }
  };
  const sameOrigin = (request: Request) => request.headers.get('origin') === origin && new URL(request.url).host === new URL(origin).host;
  async function clear(includeInternal = true) {
    const headers = new Headers({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
    for (const item of [...(includeInternal ? [cookie] : []), ordinaryCookie, membershipCookie, csrfCookie]) headers.append('set-cookie', await item.serialize('', { maxAge: 0 }));
    return headers;
  }
  async function end(request: Request) {
    if (request.method !== 'POST' || !sameOrigin(request)) return json({ error: 'Same-origin POST required' }, 403);
    const token = await parse(request);
    const headers = await clear();
    try { if (token) await options.service.end(token); }
    catch { return json({ error: 'Browser signed out; session termination could not be confirmed' }, 503, headers); }
    headers.set('location', '/');
    return new Response(null, { status: 303, headers });
  }
  async function denied(request: Request) {
    // Retain the internal cookie until explicit exit so an invalid session can
    // never silently fall back to another login cookie on the next request.
    const headers = new Headers({ 'cache-control': 'no-store', 'referrer-policy': 'same-origin' });
    if (new URL(request.url).pathname.startsWith('/api/')) return json({ error: 'Impersonation is inactive', valid: false }, 401, headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('content-security-policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    return new Response(`<!doctype html><html lang="en"><title>Impersonation ended</title><h1>Impersonation is unavailable</h1><p>The session ended or could not be verified.</p><form method="post" action="${entry}/end"><button>Exit impersonation</button></form></html>`, { status: 401, headers });
  }
  const middleware = async ({ request }: Parameters<MiddlewareFunction<Response>>[0], next: Parameters<MiddlewareFunction<Response>>[1]): Promise<Response> => {
    const path = new URL(request.url).pathname.replace(/\.data$/, '');
    if (path === entry || path === `${entry}/end` || !hasImpersonationCookie(request)) return next();
    if (path === '/auth/logout') return end(request);
    if (!options.enabled()) return denied(request);
    const token = await parse(request);
    if (!token) return denied(request);
    if (path.startsWith('/auth/') || path.startsWith('/lti/') || path.startsWith('/app/admin') || ['/api/impersonate', '/api/membership-id'].includes(path)) {
      return json({ error: 'Exit impersonation before changing authentication or organization' }, 403);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOrigin(request)) return json({ error: 'Same-origin request required' }, 403);
    let identity: ImpersonationAttribution;
    try { identity = await options.service.resolve(token); }
    catch { return denied(request); }
    const operation = { requestId: randomUUID(), action: `http.${request.method}` };
    await options.audit(identity, operation, 'request.started', path);
    try {
      const response = await runWithImpersonation(identity, operation, () => options.service.resolve(token), () => next());
      await options.audit(identity, operation, `request.completed.${response.status}`, path);
      const headers = new Headers(response.headers);
      const cookies = headers.getSetCookie();
      headers.delete('set-cookie');
      for (const value of cookies) if (!/^(en_session|membership-id)=/.test(value)) headers.append('set-cookie', value);
      headers.set('cache-control', 'no-store');
      // Preserve same-origin form Origin headers while withholding cross-site referrers.
      headers.set('referrer-policy', 'same-origin');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      await options.audit(identity, operation, 'request.failed', path);
      throw error;
    }
  };
  return {
    middleware, end,
    async page() {
      if (!options.enabled()) return json({ error: 'Not found' }, 404);
      const csrf = randomBytes(32).toString('base64url');
      const nonce = randomBytes(24).toString('base64');
      const headers = new Headers({
        'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
        'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
      });
      headers.append('set-cookie', await csrfCookie.serialize(csrf));
      return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Open impersonation session</title></head><body><h1>Opening impersonation session</h1><p id="status">Verifying your access…</p><script nonce="${nonce}">
const csrf = ${JSON.stringify(csrf)};
const token = new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null, '', location.pathname);
(async () => {
  try {
    if (!token) throw new Error();
    const response = await fetch(${JSON.stringify(entry)}, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, csrf }) });
    if (!response.ok) throw new Error();
    location.replace('/app');
  } catch { document.getElementById('status').textContent = 'This link could not be used. Request a new link from Yawp Internal.'; }
})();</script></body></html>`, { headers });
    },
    async start(request: Request) {
      if (!options.enabled()) return json({ error: 'Not found' }, 404);
      if (request.method !== 'POST' || !sameOrigin(request)) return json({ error: 'Same-origin POST required' }, 403);
      let token: string;
      try {
        if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error();
        const text = await request.text();
        if (text.length > 1000) throw new Error();
        const body = JSON.parse(text);
        const csrf = await csrfCookie.parse(request.headers.get('cookie'));
        if (!csrf || body.csrf !== csrf || typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)
          || Object.keys(body).some(key => !['token', 'csrf'].includes(key))) throw new Error();
        token = body.token;
      } catch { return json({ error: 'Invalid handoff' }, 403); }
      try {
        const prior = await parse(request);
        if (prior) await options.service.end(prior);
        const created = await options.service.start(token);
        const headers = await clear(false);
        headers.append('set-cookie', await cookie.serialize(created.cookieToken, { expires: new Date(created.identity.expiresAt), maxAge: Math.max(0, Math.floor((Date.parse(created.identity.expiresAt) - Date.now()) / 1000)) }));
        return json({ redirectTo: '/app' }, 200, headers);
      } catch { return json({ error: 'Impersonation link could not be used' }, 403); }
    },
  };
}
