import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Duplex } from 'node:stream';
import {
  createHttpRedirectHandler,
  createPreviewIngress,
  createWebSocketUpgradeHandler,
  isDirectExecution,
  targetFromDockerInspect,
} from './ingress-server.mjs';

const servers = [];
const roots = [];

async function listen(server) {
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

function request(port, {
  path = '/',
  method = 'GET',
  body,
  headers = {},
} = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        host: 'pr-241.preview.yawp.school',
        ...(body ? { 'content-length': Buffer.byteLength(body) } : {}),
        ...headers,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    outgoing.once('error', reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  })));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('preview ingress', () => {
  test('starts when systemd invokes the release through the current symlink', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preview-ingress-entrypoint-'));
    roots.push(root);
    const target = new URL('./ingress-server.mjs', import.meta.url);
    const current = path.join(root, 'ingress-server.mjs');
    symlinkSync(target, current);

    expect(isDirectExecution(target.href, current)).toBe(true);
  });

  test('proxies path, query, method, body, and trusted forwarding headers', async () => {
    let received;
    const upstreamPort = await listen(createServer(async (incoming, response) => {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      received = {
        method: incoming.method,
        url: incoming.url,
        host: incoming.headers.host,
        forwardedHost: incoming.headers['x-forwarded-host'],
        forwardedProto: incoming.headers['x-forwarded-proto'],
        injectedWakeSecret: incoming.headers['x-preview-wake-secret'],
        proxyAuthorization: incoming.headers['proxy-authorization'],
        body: Buffer.concat(chunks).toString('utf8'),
      };
      response.statusCode = 201;
      response.setHeader('x-yawp-preview-authorized', '1');
      response.end('created');
    }));
    const accesses = [];
    const ingress = createPreviewIngress({
      domain: 'preview.yawp.school',
      resolveTarget: async () => ({ host: '127.0.0.1', port: upstreamPort }),
      authorizeWake: async () => false,
      ensureRunning: async () => { throw new Error('must not wake running preview'); },
      recordAccess: async (pr) => accesses.push(pr),
    });
    const ingressPort = await listen(createServer(ingress));

    const response = await request(ingressPort, {
      path: '/api/lessons?draft=true',
      method: 'POST',
      body: JSON.stringify({ title: 'Fractions' }),
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': 'evil.example',
        'x-forwarded-proto': 'http',
        'x-preview-wake-secret': 'must-not-cross-boundary',
        'proxy-authorization': 'Basic must-not-cross-boundary',
      },
    });

    expect(response.status).toBe(201);
    expect(response.body).toBe('created');
    expect(response.headers['x-yawp-preview-authorized']).toBeUndefined();
    expect(received).toEqual({
      method: 'POST',
      url: '/api/lessons?draft=true',
      host: 'pr-241.preview.yawp.school',
      forwardedHost: 'pr-241.preview.yawp.school',
      forwardedProto: 'https',
      injectedWakeSecret: undefined,
      proxyAuthorization: undefined,
      body: JSON.stringify({ title: 'Fractions' }),
    });
    expect(accesses).toEqual([241]);
  });

  test('authorizes, wakes, and serves the original first request without redirect', async () => {
    const upstreamPort = await listen(createServer((incoming, response) => {
      response.end(`awake:${incoming.url}`);
    }));
    let running = false;
    const wakes = [];
    const ingress = createPreviewIngress({
      domain: 'preview.yawp.school',
      resolveTarget: async () => running
        ? { host: '127.0.0.1', port: upstreamPort }
        : null,
      authorizeWake: async (pr, uri) => uri.includes('code=brisk-otter-4321')
        ? { organizationId: 'local-dev-org', requirePreviewSeatCode: false }
        : null,
      ensureRunning: async (pr, options) => {
        wakes.push({ pr, options });
        running = true;
      },
      recordAccess: async () => {},
    });
    const ingressPort = await listen(createServer(ingress));

    const unauthorized = await request(ingressPort, { path: '/app' });
    const woken = await request(ingressPort, { path: '/app?code=brisk-otter-4321' });

    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body).toContain('one-click access URL');
    expect(woken.status).toBe(200);
    expect(woken.body).toBe('awake:/app?code=brisk-otter-4321');
    expect(wakes).toEqual([{
      pr: 241,
      options: {
        allowDisplacement: true,
        authorization: { organizationId: 'local-dev-org', requirePreviewSeatCode: false },
      },
    }]);
  });

  test('returns controlled retryable responses instead of proxy 429/502 errors', async () => {
    const failure = new Error('Preview pr-241 deployment is in progress');
    failure.code = 'deploying';
    const ingress = createPreviewIngress({
      domain: 'preview.yawp.school',
      resolveTarget: async () => null,
      authorizeWake: async () => true,
      ensureRunning: async () => { throw failure; },
      recordAccess: async () => {},
    });
    const ingressPort = await listen(createServer(ingress));

    const response = await request(ingressPort);

    expect(response.status).toBe(503);
    expect(response.headers['retry-after']).toBe('15');
    expect(response.body).toContain('deployment is in progress');
  });

  test('serves ACME challenges and redirects all other HTTP traffic to HTTPS', async () => {
    const handler = createHttpRedirectHandler({
      domain: 'preview.yawp.school',
      readChallenge: async (token) => token === 'valid_token-1' ? 'key-authorization' : null,
    });
    const port = await listen(createServer(handler));

    const challenge = await request(port, {
      path: '/.well-known/acme-challenge/valid_token-1',
    });
    const redirect = await request(port, { path: '/classes?mine=true' });
    const invalidHost = await request(port, {
      headers: { host: 'pr-241.preview.yawp.school.evil.test' },
    });

    expect(challenge.status).toBe(200);
    expect(challenge.body).toBe('key-authorization');
    expect(redirect.status).toBe(308);
    expect(redirect.headers.location).toBe('https://pr-241.preview.yawp.school/classes?mine=true');
    expect(invalidHost.status).toBe(404);

    const blackboardRedirect = await request(port, {
      path: '/',
      headers: { host: 'blackboard-pr-241.preview.yawp.school' },
    });
    expect(blackboardRedirect.status).toBe(308);
    expect(blackboardRedirect.headers.location).toBe(
      'https://blackboard-pr-241.preview.yawp.school/'
    );
  });

  test('proxies the Blackboard Learn host to the mock container', async () => {
    let received;
    const resolved = [];
    const accesses = [];
    const upstreamPort = await listen(createServer((incoming, response) => {
      received = {
        url: incoming.url,
        host: incoming.headers.host,
        forwardedHost: incoming.headers['x-forwarded-host'],
      };
      response.end('learn');
    }));
    const ingress = createPreviewIngress({
      domain: 'preview.yawp.school',
      resolveTarget: async (pr, options = {}) => {
        resolved.push({ pr, service: options.service || 'web' });
        return { host: '127.0.0.1', port: upstreamPort };
      },
      authorizeWake: async () => false,
      ensureRunning: async () => { throw new Error('must not wake running preview'); },
      recordAccess: async (pr) => accesses.push(pr),
    });
    const ingressPort = await listen(createServer(ingress));

    const response = await request(ingressPort, {
      headers: { host: 'blackboard-pr-241.preview.yawp.school' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toBe('learn');
    expect(resolved).toEqual([{ pr: 241, service: 'blackboard' }]);
    expect(received).toEqual({
      url: '/',
      host: 'blackboard-pr-241.preview.yawp.school',
      forwardedHost: 'blackboard-pr-241.preview.yawp.school',
    });
    expect(accesses).toEqual([241]);
  });

  test('tunnels WebSocket upgrades to the resolved preview target', async () => {
    let upstreamRequest = '';
    let clientResponse = '';
    const accesses = [];
    let responded = false;
    let sawResponse;
    const receivedResponse = new Promise((resolve) => { sawResponse = resolve; });
    const upstream = new Duplex({
      read() {},
      write(chunk, _encoding, callback) {
        upstreamRequest += chunk.toString('utf8');
        if (!responded && upstreamRequest.includes('\r\n\r\n')) {
          responded = true;
          queueMicrotask(() => {
            upstream.push('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nX-Yawp-Preview-Authorized: 1\r\n\r\n');
            upstream.push(null);
          });
        }
        callback();
      },
    });
    const client = new Duplex({
      read() {},
      write(chunk, _encoding, callback) {
        clientResponse += chunk.toString('utf8');
        if (clientResponse.includes('\r\n\r\n')) sawResponse();
        callback();
      },
    });
    const upgrade = createWebSocketUpgradeHandler({
      domain: 'preview.yawp.school',
      resolveTarget: async () => ({ host: '172.21.0.14', port: 8080 }),
      authorizeWake: async () => false,
      ensureRunning: async () => {},
      recordAccess: async (pr) => accesses.push(pr),
      connectTarget: () => {
        queueMicrotask(() => upstream.emit('connect'));
        return upstream;
      },
    });
    await upgrade({
      method: 'GET',
      url: '/socket',
      headers: {
        host: 'pr-241.preview.yawp.school',
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
      },
      socket: { remoteAddress: '127.0.0.1' },
    }, client, Buffer.alloc(0));
    await receivedResponse;

    expect(clientResponse).toContain('101 Switching Protocols');
    expect(clientResponse).not.toContain('X-Yawp-Preview-Authorized');
    expect(accesses).toEqual([241]);
    expect(upstreamRequest).toContain('GET /socket HTTP/1.1');
    expect(upstreamRequest).toContain('host: pr-241.preview.yawp.school');
    client.destroy();
    upstream.destroy();
  });

  test('extracts only a running preview-network target from Docker inspect', () => {
    expect(targetFromDockerInspect({
      State: { Running: true },
      NetworkSettings: { Networks: { preview: { IPAddress: '172.21.0.14' } } },
    })).toEqual({ host: '172.21.0.14', port: 8080 });
    expect(targetFromDockerInspect({
      State: { Running: true },
      NetworkSettings: { Networks: { preview: { IPAddress: '172.21.0.22' } } },
    }, 9473)).toEqual({ host: '172.21.0.22', port: 9473 });
    expect(targetFromDockerInspect({
      State: { Running: false },
      NetworkSettings: { Networks: { preview: { IPAddress: '172.21.0.14' } } },
    })).toBeNull();
    expect(targetFromDockerInspect({ State: { Running: true }, NetworkSettings: {} })).toBeNull();
  });
});
