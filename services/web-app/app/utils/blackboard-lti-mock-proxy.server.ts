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
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

