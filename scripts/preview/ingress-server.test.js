import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Duplex } from 'node:stream';
import { runInNewContext } from 'node:vm';
import {
  createHttpRedirectHandler,
  createCertificateStore,
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

function createCertificate(root, hostname) {
  const keyPath = path.join(root, 'key.pem');
  const certPath = path.join(root, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-subj', `/CN=${hostname}`,
    '-addext', `subjectAltName=DNS:${hostname}`,
    '-days', '90',
    '-keyout', keyPath,
    '-out', certPath,
  ], { stdio: 'ignore' });
  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  })));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('preview ingress', () => {
  test('routes the UA preview hostname to the same web container with its host preserved', async () => {
    let receivedHost;
    let resolvedService;
    const upstreamPort = await listen(createServer((incoming, response) => {
      receivedHost = incoming.headers.host;
      response.end('ua');
    }));
    const ingress = createPreviewIngress({
      domain: 'preview.yawp.school',
      resolveTarget: async (_pr, { service }) => {
        resolvedService = service;
        return { host: '127.0.0.1', port: upstreamPort };
      },
      authorizeWake: async () => false,
      ensureRunning: async () => {},
      recordAccess: async () => {},
    });
    const ingressPort = await listen(createServer(ingress));

    const response = await request(ingressPort, {
      headers: { host: 'ua-pr-241.preview.yawp.school' },
    });

    expect(response.status).toBe(200);
    expect(resolvedService).toBe('ua');
    expect(receivedHost).toBe('ua-pr-241.preview.yawp.school');
  });

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

  test('plain URL flow executes page JS, POSTs wake, polls readiness, and reloads the original URL', async () => {
    let running = false;
    const wakes = [];
    const upstreamPort = await listen(createServer((_incoming, response) => response.end('app access gate')));
    const ingressPort = await listen(createServer(createPreviewIngress({
      domain: 'preview.yawp.school',
      resolveTarget: async () => running ? { host: '127.0.0.1', port: upstreamPort } : null,
      isOpen: async () => true,
      authorizeWake: async () => false,
      ensureRunning: async (pr) => { wakes.push(pr); running = true; },
      recordAccess: async () => {},
    })));
    const page = await request(ingressPort, { path: '/app?tab=lessons' });
    expect(page.status).toBe(503);
    expect(page.body).toContain('Waking preview');
    expect(wakes).toEqual([]);
    let reloaded = false;
    const scripts = [...page.body.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBe(1);
    await runInNewContext(scripts[0][1], {
      fetch: async (url, options = {}) => {
        const result = await request(ingressPort, {
          path: url, method: options.method || 'GET',
          headers: { 'user-agent': 'Mozilla/5.0', ...options.headers },
        });
        return { status: result.status, ok: result.status < 400, json: async () => JSON.parse(result.body) };
      },
      location: { reload: () => { reloaded = true; } },
      document: { querySelector: () => ({ textContent: '' }) },
      setTimeout: (fn) => { fn(); },
    });
    expect(reloaded).toBe(true);
    expect(wakes).toEqual([241]);
    const app = await request(ingressPort, { path: '/app?tab=lessons' });
    expect(app.body).toBe('app access gate');
  });

  test('GET, bots, cross-site POSTs, and closed/non-resident PRs cannot wake', async () => {
    const wakes = [];
    const port = await listen(createServer(createPreviewIngress({
      domain: 'preview.yawp.school', resolveTarget: async () => null,
      isResident: async (pr) => pr !== 999, isOpen: async (pr) => pr !== 998,
      authorizeWake: async () => true, ensureRunning: async (pr) => wakes.push(pr),
      recordAccess: async () => {},
    })));
    for (const ua of ['Mozilla/5.0', 'Googlebot', 'Slackbot-LinkExpanding 1.0', 'facebookexternalhit']) {
      await request(port, { path: '/?code=test', headers: { 'user-agent': ua } });
      await request(port, { path: '/__wake', headers: { 'user-agent': ua } });
    }
    for (const ua of ['Googlebot', 'Slackbot', 'kube-probe/1.0']) {
      expect((await request(port, { path: '/__wake', method: 'POST', headers: { 'user-agent': ua, 'x-preview-wake': '1' } })).status).toBe(403);
    }
    expect((await request(port, { path: '/__wake', method: 'POST', headers: { origin: 'https://evil.example', 'x-preview-wake': '1' } })).status).toBe(403);
    for (const pr of [998, 999]) {
      expect((await request(port, { path: '/__wake', method: 'POST', headers: { host: `pr-${pr}.preview.yawp.school`, 'x-preview-wake': '1' } })).status).toBe(404);
    }
    expect(wakes).toEqual([]);
  });

  test('GETs, rejected bots, and over-budget wakes do not spend GitHub lookups', async () => {
    let checks = 0;
    const port = await listen(createServer(createPreviewIngress({
      domain: 'preview.yawp.school', resolveTarget: async () => null,
      isOpen: async () => { checks++; return true; },
      ensureRunning: async () => {}, recordAccess: async () => {},
      wakeLimits: { globalHour: 1 },
    })));
    await request(port);
    for (let i = 0; i < 4; i++) await request(port, { path: '/__wake', method: 'POST', headers: { 'user-agent': 'Googlebot', 'x-preview-wake': '1' } });
    expect(checks).toBe(0);
    await request(port, { path: '/__wake', method: 'POST', headers: { 'x-preview-wake': '1' } });
    await Bun.sleep(10);
    await request(port, { path: '/__wake', method: 'POST', headers: { host: 'pr-242.preview.yawp.school', 'x-preview-wake': '1' } });
    expect(checks).toBe(1);
  });

  test('/__wake POST still accepts authorized lane callers and rate-limits PR, IP, and global wakes', async () => {
    let now = 1000;
    const wakes = [];
    const port = await listen(createServer(createPreviewIngress({
      domain: 'preview.yawp.school', resolveTarget: async () => null, isOpen: async () => true,
      authorizeWake: async () => true, ensureRunning: async (pr) => wakes.push(pr),
      recordAccess: async () => {}, now: () => now,
      wakeLimits: { perPrSeconds: 60, perIpHour: 2, globalHour: 3 },
    })));
    const post = (pr) => request(port, { path: '/__wake', method: 'POST', headers: { host: `pr-${pr}.preview.yawp.school`, 'x-forwarded-for': `fake-${pr}` } });
    expect((await post(241)).status).toBe(202);
    await Bun.sleep(10);
    expect((await post(241)).status).toBe(429);
    expect((await post(242)).status).toBe(202);
    await Bun.sleep(10);
    expect((await post(243)).status).toBe(429);
    now += 3601;
    expect((await post(243)).status).toBe(202);
    expect(wakes).toEqual([241, 242, 243]);
  });

  test('anonymous wake requires the fetch header and respects its rollout flag', async () => {
    for (const enabled of [true, false]) {
      const wakes = [];
      const port = await listen(createServer(createPreviewIngress({
        domain: 'preview.yawp.school', resolveTarget: async () => null,
        isOpen: async () => true, authorizeWake: async () => false,
        ensureRunning: async (pr) => wakes.push(pr), recordAccess: async () => {}, plainWakeEnabled: enabled,
      })));
      expect((await request(port, { path: '/__wake', method: 'POST' })).status).toBe(401);
      expect((await request(port, { path: '/__wake', method: 'POST', headers: { 'x-preview-wake': '1' } })).status).toBe(enabled ? 202 : 401);
      await Bun.sleep(10);
      expect(wakes).toEqual(enabled ? [241] : []);
    }
  });

  test('records only human document navigations and API/login POSTs, including app access gate', async () => {
    const accesses = [];
    const upstreamPort = await listen(createServer((_req, res) => { res.statusCode = 401; res.end('access gate'); }));
    const port = await listen(createServer(createPreviewIngress({
      domain: 'preview.yawp.school', resolveTarget: async () => ({ host: '127.0.0.1', port: upstreamPort }),
      ensureRunning: async () => {}, recordAccess: async (pr) => accesses.push(pr),
    })));
    await request(port, { headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0' } });
    await request(port, { method: 'POST', path: '/auth/login', headers: { 'user-agent': 'Mozilla/5.0' } });
    await request(port, { method: 'POST', path: '/api/lessons', headers: { 'user-agent': 'Mozilla/5.0' } });
    await request(port, { headers: { 'sec-fetch-mode': 'navigate', 'user-agent': 'Mozilla/5.0' } });
    for (const options of [
      { path: '/assets/app.js' }, { path: '/__wake' }, { path: '/api/healthcheck', headers: { accept: 'text/html' } },
      { headers: { accept: 'text/html', 'user-agent': 'Googlebot' } },
      { headers: { accept: 'text/html', 'user-agent': 'ELB-HealthChecker/2.0' } },
      { method: 'HEAD', headers: { accept: 'text/html' } },
    ]) await request(port, options);
    expect(accesses).toEqual([241, 241, 241, 241]);
  });

  test('returns no-preview HTML for non-resident PRs without running a wake', async () => {
    const ingress = createPreviewIngress({
      domain: 'preview.yawp.school',
      resolveTarget: async () => null,
      isResident: async () => false,
      authorizeWake: async () => true,
      ensureRunning: async () => { throw new Error('must not wake'); },
      recordAccess: async () => {},
    });
    const ingressPort = await listen(createServer(ingress));

    const response = await request(ingressPort);

    expect(response.status).toBe(404);
    expect(response.body).toContain('No preview');
  });

  test('serves status JSON and HTML without secrets', async () => {
    const status = {
      running: 1,
      maxRunning: 8,
      host: { memAvailable: '2.0 GiB' },
      previews: [{
        pr: 241,
        branch: 'codex/preview-lru',
        author: 'codex',
        state: 'waking',
        pinned: false,
        lastRequest: 1_800_000_000,
        lastDeploy: 1_800_000_100,
        lastHumanActivity: 1_800_000_200,
        sleepsAt: 1_800_173_000,
        rss: '512 MiB',
        url: 'https://pr-241.preview.yawp.school',
      }],
    };
    const ingress = createPreviewIngress({
      domain: 'preview.yawp.school',
      resolveTarget: async () => null,
      authorizeWake: async () => false,
      ensureRunning: async () => {},
      recordAccess: async () => {},
      getStatus: async () => status,
    });
    const ingressPort = await listen(createServer(ingress));

    const jsonResponse = await request(ingressPort, { path: '/__status' });
    const htmlResponse = await request(ingressPort, {
      headers: { host: 'status.preview.yawp.school' },
    });

    expect(jsonResponse.status).toBe(200);
    expect(JSON.parse(jsonResponse.body).previews[0].state).toBe('waking');
    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.body).toContain('Yawp Preview Status');
    expect(htmlResponse.body).toContain('Last human activity');
    expect(htmlResponse.body).toContain('Sleeps at');
    expect(htmlResponse.body).toContain('codex/preview-lru');
    expect(htmlResponse.body).not.toContain('brisk-otter');
    expect(htmlResponse.body).not.toContain('SECRET');
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
      headers: { host: 'blackboard-pr-241.preview.yawp.school', accept: 'text/html' },
    });
    const statusRedirect = await request(port, {
      path: '/__status',
      headers: { host: 'status.preview.yawp.school' },
    });
    expect(blackboardRedirect.status).toBe(308);
    expect(blackboardRedirect.headers.location).toBe(
      'https://blackboard-pr-241.preview.yawp.school/'
    );
    expect(statusRedirect.status).toBe(308);
    expect(statusRedirect.headers.location).toBe(
      'https://status.preview.yawp.school/__status'
    );
  });

  test('serves one wildcard certificate for any PR preview hostname', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preview-ingress-certs-'));
    roots.push(root);
    const certRoot = path.join(root, 'certs');
    const wildcardRoot = path.join(certRoot, '_wildcard.preview.yawp.school');
    const legacyRoot = path.join(certRoot, 'ua-pr-241.preview.yawp.school');
    mkdirSync(wildcardRoot, { recursive: true });
    mkdirSync(legacyRoot, { recursive: true });
    const wildcard = createCertificate(root, '*.preview.yawp.school');
    const legacy = createCertificate(root, 'ua-pr-241.preview.yawp.school');
    writeFileSync(path.join(wildcardRoot, 'privkey.pem'), wildcard.key);
    writeFileSync(path.join(wildcardRoot, 'fullchain.pem'), wildcard.cert);
    writeFileSync(path.join(legacyRoot, 'privkey.pem'), legacy.key);
    writeFileSync(path.join(legacyRoot, 'fullchain.pem'), legacy.cert);

    const store = createCertificateStore({
      certRoot,
      domain: 'preview.yawp.school',
      defaultHostname: '_wildcard.preview.yawp.school',
    });
    let err;
    let context;
    store.sniCallback('ua-pr-241.preview.yawp.school', (nextErr, nextContext) => {
      err = nextErr;
      context = nextContext;
    });

    expect(err).toBeNull();
    expect(context).toBeTruthy();
    expect(context).toBe(store.defaultPair.context);
    expect(store.defaultPair.cert.equals(wildcard.cert)).toBe(true);
  });

  test('serves the wildcard certificate for the status hostname', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preview-ingress-status-certs-'));
    roots.push(root);
    const certRoot = path.join(root, 'certs');
    const wildcardRoot = path.join(certRoot, '_wildcard.preview.yawp.school');
    mkdirSync(wildcardRoot, { recursive: true });
    const wildcard = createCertificate(root, '*.preview.yawp.school');
    writeFileSync(path.join(wildcardRoot, 'privkey.pem'), wildcard.key);
    writeFileSync(path.join(wildcardRoot, 'fullchain.pem'), wildcard.cert);

    const store = createCertificateStore({
      certRoot,
      domain: 'preview.yawp.school',
      defaultHostname: '_wildcard.preview.yawp.school',
    });
    let err;
    let context;
    store.sniCallback('status.preview.yawp.school', (nextErr, nextContext) => {
      err = nextErr;
      context = nextContext;
    });

    expect(err).toBeNull();
    expect(context).toBeTruthy();
    expect(context).toBe(store.defaultPair.context);
  });

  test('falls back to an exact certificate when the wildcard pair is unusable', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preview-ingress-invalid-wildcard-'));
    roots.push(root);
    const certRoot = path.join(root, 'certs');
    const wildcardRoot = path.join(certRoot, '_wildcard.preview.yawp.school');
    const exactRoot = path.join(certRoot, 'ua-pr-241.preview.yawp.school');
    mkdirSync(wildcardRoot, { recursive: true });
    mkdirSync(exactRoot, { recursive: true });
    const wrongWildcard = createCertificate(root, '*.other-preview.yawp.school');
    const exact = createCertificate(root, 'ua-pr-241.preview.yawp.school');
    writeFileSync(path.join(wildcardRoot, 'privkey.pem'), wrongWildcard.key);
    writeFileSync(path.join(wildcardRoot, 'fullchain.pem'), wrongWildcard.cert);
    writeFileSync(path.join(exactRoot, 'privkey.pem'), exact.key);
    writeFileSync(path.join(exactRoot, 'fullchain.pem'), exact.cert);

    const store = createCertificateStore({
      certRoot,
      domain: 'preview.yawp.school',
      defaultHostname: 'ua-pr-241.preview.yawp.school',
    });
    let err;
    let context;
    store.sniCallback('ua-pr-241.preview.yawp.school', (nextErr, nextContext) => {
      err = nextErr;
      context = nextContext;
    });

    expect(err).toBeNull();
    expect(context).toBeTruthy();
    expect(context).toBe(store.defaultPair.context);
    expect(store.defaultPair.cert.equals(exact.cert)).toBe(true);
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
      headers: { host: 'blackboard-pr-241.preview.yawp.school', accept: 'text/html' },
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
    expect(accesses).toEqual([]);
    expect(upstreamRequest).toContain('GET /socket HTTP/1.1');
    expect(upstreamRequest).toContain('host: pr-241.preview.yawp.school');
    client.destroy();
    upstream.destroy();
  });

  test('readiness remains waking until the health-gated wake operation completes', async () => {
    let release;
    let running = false;
    const pending = new Promise(resolve => { release = resolve; });
    const port = await listen(createServer(createPreviewIngress({
      domain: 'preview.yawp.school', isOpen: async () => true,
      resolveTarget: async () => running ? { host: '127.0.0.1', port: 1 } : null,
      ensureRunning: async () => { running = true; await pending; }, recordAccess: async () => {},
    })));
    await request(port, { path: '/__wake', method: 'POST', headers: { 'x-preview-wake': '1' } });
    await Bun.sleep(5);
    const status = await request(port, { path: '/__wake' });
    release();
    expect(JSON.parse(status.body).status).toBe('waking');
  });

  test('starting or unhealthy Docker containers are not ready targets', () => {
    for (const status of ['starting', 'unhealthy']) {
      expect(targetFromDockerInspect({
        State: { Running: true, Health: { Status: status } },
        NetworkSettings: { Networks: { preview: { IPAddress: '172.21.0.14' } } },
      })).toBeNull();
    }
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
