import { blackboardLtiMockUpstreamUrl } from './blackboard-lti-mock-ui.server';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

export async function proxyBlackboardLtiMock(request: Request, splat = '') {
  const upstream = blackboardLtiMockUpstreamUrl();
  if (!upstream) {
    return new Response('Not found', { status: 404 });
  }

  const prefix = '/dev/blackboard-lti-mock';
  const url = new URL(request.url);
  const suffix = splat
    ? `/${splat.replace(/^\/+/, '')}`
    : url.pathname.slice(prefix.length) || '/';
  const target = new URL(`${suffix}${url.search}`, `${upstream}/`);

  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name.toLowerCase())) headers.set(name, value);
  });
  // Preserve the public origin for absolute URLs the mock generates
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(/:$/, ''));
  headers.set(
    'x-forwarded-port',
    url.protocol === 'https:' ? '443' : url.port || '80'
  );

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const upstreamResponse = await fetch(target, init);
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete('transfer-encoding');
  // Rewrite absolute Location headers to this preview host to prevent cross-preview hops
  const rawLocation = responseHeaders.get('location');
  if (rawLocation) {
    try {
      const loc = new URL(rawLocation, `${url.protocol}//${url.host}`);
      // If upstream points to a different host for /lti/login, force same-origin /lti/login
      if (
        loc.host !== url.host &&
        (/\/lti\/login(?:\/)?$/i.test(loc.pathname) || loc.pathname === '/lti/login')
      ) {
        const sameOriginLogin = new URL('/lti/login', url.origin);
        // Preserve query parameters from upstream
        for (const [k, v] of loc.searchParams.entries()) {
          sameOriginLogin.searchParams.set(k, v);
        }
        responseHeaders.set('location', sameOriginLogin.toString());
      }
    } catch {
      // ignore parse failures; leave header as-is
    }
  }
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}
