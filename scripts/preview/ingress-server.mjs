import { request as httpRequest, createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { readFile, readdir, stat } from 'node:fs/promises';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { connect as netConnect } from 'node:net';
import { createSecureContext } from 'node:tls';
import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  createDefaultWakeOperations,
  parsePreviewHost,
  parsePreviewPr,
  previewServiceHostname,
} from './wake-server.mjs';
import { isBotRequest, isHumanActivity, createWakeLimiter } from './wake-policy.mjs';

export function isDirectExecution(moduleUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const INTERNAL_REQUEST_HEADERS = new Set([
  'x-preview-wake-secret',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
]);
const INTERNAL_RESPONSE_HEADERS = new Set(['x-yawp-preview-authorized']);

function send(response, status, body = '', headers = {}) {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    ...headers,
  });
  response.end(body);
}

function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function isStatusHost(host, domain) {
  const hostname = String(host || '').toLowerCase().replace(/:\d+$/, '');
  return hostname === `status.${String(domain || '').toLowerCase()}`;
}

function isStatusPath(url) {
  return String(url || '/').split('?')[0] === '/__status';
}

function isWakePath(url) {
  return String(url || '/').split('?')[0] === '/__wake';
}

function sendWakingPage(response, pr) {
  const title = `Waking preview pr-${pr}`;
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>${htmlEscape(title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f6f8fb; }
    main { width: min(520px, calc(100vw - 32px)); }
    h1 { margin: 0 0 8px; font-size: 1.5rem; }
    p { margin: 0; color: #46556c; }
  </style>
</head>
<body>
  <main>
    <h1>Waking preview&hellip;</h1>
    <p>pr-${htmlEscape(pr)} is starting. This usually takes a minute. Keep this page open.</p>
  </main>
  <script>
  (async () => {
    const message = document.querySelector('p');
    const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    for (;;) {
      try {
        const wake = await fetch('/__wake' + (location.search || ''), { method: 'POST', headers: { 'x-preview-wake': '1' } });
        if (wake.status === 404 || wake.status === 401 || wake.status === 403) {
          message.textContent = 'This preview is unavailable. Use its access URL if access is required.';
          return;
        }
        for (let attempt = 0; attempt < 30; attempt++) {
          const response = await fetch('/__wake', { cache: 'no-store' });
          const status = await response.json();
          if (status.status === 'running') { location.reload(); return; }
          await pause(5000);
        }
      } catch { message.textContent = 'Waiting for the preview host. Retrying shortly…'; }
      await pause(15000);
    }
  })()
  </script>
</body>
</html>`;
  response.writeHead(503, {
    'content-type': 'text/html; charset=utf-8',
    'retry-after': '5',
    'cache-control': 'no-store',
  });
  response.end(body);
}

function sendNoPreviewPage(response, pr) {
  response.writeHead(404, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>No preview</title></head><body><main><h1>No preview for pr-${htmlEscape(pr)}</h1><p>Push a commit or add the preview:keep-awake label to rebuild it.</p></main></body></html>`);
}

function json(response, status, value, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function renderStatusPage(status) {
  const rows = status.previews.map((preview) => `<tr>
    <td><a href="${htmlEscape(preview.url)}">#${htmlEscape(preview.pr)}</a></td>
    <td>${htmlEscape(preview.branch || '')}</td>
    <td>${htmlEscape(preview.author || '')}</td>
    <td>${htmlEscape(preview.state)}</td>
    <td>${preview.pinned ? 'yes' : 'no'}</td>
    <td>${preview.lastRequest ? new Date(preview.lastRequest * 1000).toISOString() : ''}</td>
    <td>${preview.lastHumanActivity ? new Date(preview.lastHumanActivity * 1000).toISOString() : ''}</td>
    <td>${preview.sleepsAt ? new Date(preview.sleepsAt * 1000).toISOString() : ''}</td>
    <td>${preview.lastDeploy ? new Date(preview.lastDeploy * 1000).toISOString() : ''}</td>
    <td>${htmlEscape(preview.rss || '')}</td>
  </tr>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Yawp Preview Status</title>
  <style>
    body { margin: 0; font: 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #162033; background: #f7f8fb; }
    main { padding: 24px; }
    h1 { margin: 0 0 4px; font-size: 1.4rem; }
    p { margin: 0 0 18px; color: #56657c; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d7deea; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #e6ebf2; text-align: left; white-space: nowrap; }
    th { background: #eef2f7; font-weight: 650; }
    a { color: #1459a8; }
  </style>
</head>
<body>
  <main>
    <h1>Yawp Preview Status</h1>
    <p>${htmlEscape(status.running)}/${htmlEscape(status.maxRunning)} running, host free memory ${htmlEscape(status.host.memAvailable || 'unknown')}.</p>
    <table>
      <thead><tr><th>PR</th><th>Branch</th><th>Author</th><th>State</th><th>Pinned</th><th>Last Request</th><th>Last human activity</th><th>Sleeps at</th><th>Last Deploy</th><th>RSS</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
</body>
</html>`;
}

function connectionHeaderNames(headers) {
  return new Set(String(headers.connection || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
}

function forwardedHeaders(request, hostname, { upgrade = false } = {}) {
  const connectionHeaders = connectionHeaderNames(request.headers);
  const headers = {};
  for (const [name, value] of Object.entries(request.headers)) {
    const lower = name.toLowerCase();
    if (
      INTERNAL_REQUEST_HEADERS.has(lower)
      || connectionHeaders.has(lower)
      || HOP_BY_HOP_HEADERS.has(lower)
    ) continue;
    headers[lower] = value;
  }
  headers.host = hostname;
  headers['x-forwarded-host'] = hostname;
  headers['x-forwarded-port'] = '443';
  headers['x-forwarded-proto'] = 'https';
  const remoteAddress = request.socket?.remoteAddress;
  if (remoteAddress) headers['x-forwarded-for'] = remoteAddress;
  if (upgrade) {
    headers.connection = 'Upgrade';
    headers.upgrade = request.headers.upgrade || 'websocket';
  }
  return headers;
}

function downstreamHeaders(headers) {
  const connectionHeaders = connectionHeaderNames(headers);
  const filtered = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(lower)
      || connectionHeaders.has(lower)
      || INTERNAL_RESPONSE_HEADERS.has(lower)
    ) continue;
    filtered[lower] = value;
  }
  return filtered;
}

function wakeErrorResponse(error) {
  if (error?.code === 'capacity-full') {
    return [503, 'Preview capacity is full; retry shortly.\n'];
  }
  if (error?.code === 'deploying') {
    return [503, 'Preview deployment is in progress; retry shortly.\n'];
  }
  if (error?.code === 'authorization-stale') {
    return [503, 'Preview authorization expired while queued; retry.\n'];
  }
  if (error?.code === 'not-resident') {
    return [404, 'Preview is no longer resident.\n'];
  }
  console.error('Preview wake failed', error?.code || 'unavailable');
  return [503, 'Preview is temporarily unavailable; retry shortly.\n'];
}

function createWakeCoordinator({
  ensureRunning,
  maxConcurrentWakes,
  recordQueuedWake = async () => {},
  clearQueuedWake = async () => {},
}) {
  if (!Number.isSafeInteger(maxConcurrentWakes) || maxConcurrentWakes < 1) {
    throw new Error('maxConcurrentWakes must be a positive integer');
  }
  const inFlight = new Map();
  return {
    isWaking(pr) {
      return inFlight.has(pr);
    },
    wakingPrs() {
      return [...inFlight.keys()];
    },
    enqueue(pr, authorization) {
      if (!inFlight.has(pr)) {
        if (inFlight.size >= maxConcurrentWakes) {
          const error = new Error('Preview wake concurrency is full');
          error.code = 'capacity-full';
          throw error;
        }
        const options = {
          allowDisplacement: true,
          ...(typeof authorization === 'object' && authorization
            ? { authorization }
            : {}),
        };
        const operation = Promise.resolve()
          .then(() => recordQueuedWake(pr))
          .then(() => ensureRunning(pr, options))
          .finally(async () => {
            try { await clearQueuedWake(pr); } finally { inFlight.delete(pr); }
          });
        inFlight.set(pr, operation);
      }
      return inFlight.get(pr);
    },
  };
}

function proxyHttp({ request, response, target, hostname, pr, recordAccess }) {
  return new Promise((resolve) => {
    let settled = false;
    const upstream = httpRequest({
      host: target.host,
      port: target.port || 8080,
      method: request.method,
      path: request.url,
      headers: forwardedHeaders(request, hostname),
    }, (upstreamResponse) => {
      const status = upstreamResponse.statusCode || 503;
      response.writeHead(status, downstreamHeaders(upstreamResponse.headers));
      upstreamResponse.pipe(response);
      upstreamResponse.once('end', () => {
        if (isHumanActivity(request) && status < 500) {
          Promise.resolve(recordAccess(pr)).catch(() => {
            console.error('Preview activity recording failed');
          });
        }
        if (!settled) {
          settled = true;
          resolve(true);
        }
      });
    });
    upstream.setTimeout(120_000, () => upstream.destroy(new Error('Preview upstream timed out')));
    upstream.once('error', (error) => {
      if (!response.headersSent) {
        console.error(`Preview pr-${pr} upstream unavailable`, error.message);
        send(response, 503, 'Preview is starting; retry shortly.\n', { 'retry-after': '5' });
      } else {
        response.destroy(error);
      }
      if (!settled) {
        settled = true;
        resolve(false);
      }
    });
    request.once('aborted', () => upstream.destroy());
    request.pipe(upstream);
  });
}

export function createPreviewIngress({
  domain,
  resolveTarget,
  authorizeWake,
  ensureRunning,
  isResident = async () => true,
  isOpen = async () => false,
  plainWakeEnabled = true,
  wakeLimits,
  now,
  recordAccess,
  recordQueuedWake,
  clearQueuedWake,
  getStatus,
  maxConcurrentWakes = 2,
}) {
  if (!domain) throw new Error('preview ingress domain is required');
  const wake = createWakeCoordinator({
    ensureRunning,
    maxConcurrentWakes,
    recordQueuedWake,
    clearQueuedWake,
  });

  const limiter = createWakeLimiter({ ...wakeLimits, now });

  async function queueWake({ parsed, request, response }) {
    const resident = await isResident(parsed.pr);
    if (!resident || !await isOpen(parsed.pr)) {
      json(response, 404, { status: 'not-resident', pr: parsed.pr });
      return;
    }
    if (isBotRequest(request)
      || request.headers['sec-fetch-site'] === 'cross-site'
      || (request.headers.origin && request.headers.origin !== `https://${request.headers.host}`)) {
      json(response, 403, { status: 'forbidden', pr: parsed.pr });
      return;
    }
    const anonymous = plainWakeEnabled && request.headers['x-preview-wake'] === '1';
    const authorization = anonymous ? null : await authorizeWake(parsed.pr, request.url, request);
    if (!anonymous && !authorization) {
      json(response, 401, { status: 'unauthorized', pr: parsed.pr });
      return;
    }
    if (wake.isWaking(parsed.pr)) {
      json(response, 202, { status: 'waking', pr: parsed.pr });
      return;
    }
    const retryAfter = limiter.take(parsed.pr, request.socket?.remoteAddress || 'unknown');
    if (retryAfter) {
      json(response, 429, { status: 'rate-limited', pr: parsed.pr }, { 'retry-after': String(retryAfter) });
      return;
    }
    try {
      wake.enqueue(parsed.pr, authorization).catch((error) => {
        console.error(`Preview pr-${parsed.pr} wake failed`, error?.code || 'unavailable');
      });
    } catch (error) {
      const [status, body] = wakeErrorResponse(error);
      json(response, status, { status: 'error', pr: parsed.pr, message: body.trim() }, status === 503 ? { 'retry-after': '15' } : {});
      return;
    }
    json(response, 202, { status: 'waking', pr: parsed.pr }, { 'retry-after': '5' });
  }

  return async (request, response) => {
    const rawHost = Array.isArray(request.headers.host)
      ? request.headers.host[0]
      : request.headers.host || '';
    if ((isStatusHost(rawHost, domain) || isStatusPath(request.url)) && getStatus) {
      const status = await getStatus({ wakingPrs: wake.wakingPrs() });
      if (isStatusPath(request.url)) {
        json(response, 200, status);
      } else {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        });
        response.end(renderStatusPage(status));
      }
      return;
    }
    const parsed = parsePreviewHost(rawHost, domain);
    if (parsed === null) {
      send(response, 404, 'Not found.\n');
      return;
    }
    const hostname = previewServiceHostname(parsed.pr, domain, parsed.service);
    const target = await resolveTarget(parsed.pr, { service: parsed.service });
    if (isWakePath(request.url)) {
      if (!['GET', 'POST'].includes(request.method)) {
        json(response, 405, { status: 'method-not-allowed' }, { allow: 'GET, POST' });
      } else if (target && !wake.isWaking(parsed.pr)) {
        json(response, 200, { status: 'running', pr: parsed.pr });
      } else if (request.method === 'GET') {
        json(response, 200, { status: wake.isWaking(parsed.pr) ? 'waking' : 'sleeping', pr: parsed.pr });
      } else {
        await queueWake({ parsed, request, response });
      }
      return;
    }
    if (!target) {
      if (!await isResident(parsed.pr) || !await isOpen(parsed.pr)) sendNoPreviewPage(response, parsed.pr);
      else sendWakingPage(response, parsed.pr);
      return;
    }
    await proxyHttp({
      request,
      response,
      target,
      hostname,
      pr: parsed.pr,
      recordAccess,
    });
  };
}

function writeSocketResponse(socket, status, body) {
  const payload = Buffer.from(body);
  socket.end([
    `HTTP/1.1 ${status}`,
    'Connection: close',
    'Content-Type: text/plain; charset=utf-8',
    `Content-Length: ${payload.length}`,
    '',
    body,
  ].join('\r\n'));
}

export function createWebSocketUpgradeHandler({
  domain,
  resolveTarget,
  authorizeWake,
  ensureRunning,
  isResident = async () => true,
  recordAccess = async () => {},
  recordQueuedWake,
  clearQueuedWake,
  maxConcurrentWakes = 2,
  connectTarget = netConnect,
}) {
  const wake = createWakeCoordinator({
    ensureRunning,
    maxConcurrentWakes,
    recordQueuedWake,
    clearQueuedWake,
  });
  return async (request, socket, head) => {
    socket.on('error', () => {});
    socket.resume();
    const rawHost = Array.isArray(request.headers.host)
      ? request.headers.host[0]
      : request.headers.host || '';
    const parsed = parsePreviewHost(rawHost, domain);
    if (parsed === null) {
      writeSocketResponse(socket, '404 Not Found', 'Not found.\n');
      return;
    }
    const hostname = previewServiceHostname(parsed.pr, domain, parsed.service);
    const target = await resolveTarget(parsed.pr, { service: parsed.service });
    if (!target) {
      writeSocketResponse(socket, '503 Service Unavailable', 'Open this preview in a browser to wake it.\n');
      return;
    }

    const upstreamSocket = connectTarget(target.port || 8080, target.host);
    let responsePreamble = Buffer.alloc(0);
    let responseHeadersComplete = false;
    upstreamSocket.once('connect', () => {
      upstreamSocket.on('data', (chunk) => {
        if (socket.destroyed) return;
        if (responseHeadersComplete) {
          socket.write(chunk);
          return;
        }
        responsePreamble = Buffer.concat([responsePreamble, chunk]);
        if (responsePreamble.length > 64 * 1024) {
          upstreamSocket.destroy(new Error('WebSocket response headers exceeded limit'));
          return;
        }
        const boundary = responsePreamble.indexOf('\r\n\r\n');
        if (boundary < 0) return;
        const headerBlock = responsePreamble.subarray(0, boundary).toString('latin1');
        const remainder = responsePreamble.subarray(boundary + 4);
        const lines = headerBlock.split('\r\n');
        const sanitized = lines.filter((line) => !/^x-yawp-preview-authorized:/i.test(line));
        socket.write(`${sanitized.join('\r\n')}\r\n\r\n`);
        if (remainder.length) socket.write(remainder);
        responsePreamble = Buffer.alloc(0);
        responseHeadersComplete = true;
      });
      socket.on('data', (chunk) => {
        if (!upstreamSocket.destroyed) upstreamSocket.write(chunk);
      });
      upstreamSocket.once('end', () => socket.end());
      socket.once('end', () => upstreamSocket.end());
      const headers = forwardedHeaders(request, hostname, { upgrade: true });
      const lines = [`${request.method || 'GET'} ${request.url || '/'} HTTP/1.1`];
      for (const [name, value] of Object.entries(headers)) {
        if (Array.isArray(value)) {
          for (const item of value) lines.push(`${name}: ${item}`);
        } else if (value !== undefined) {
          lines.push(`${name}: ${value}`);
        }
      }
      upstreamSocket.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head?.length) upstreamSocket.write(head);
    });
    upstreamSocket.once('error', () => {
      if (!responseHeadersComplete) {
        writeSocketResponse(socket, '503 Service Unavailable', 'Preview is starting; retry shortly.\n');
      } else {
        socket.destroy();
      }
    });
  };
}

export function targetFromDockerInspect(inspect, port = 8080) {
  const address = inspect?.NetworkSettings?.Networks?.preview?.IPAddress;
  if (!inspect?.State?.Running
    || (inspect.State.Health && inspect.State.Health.Status !== 'healthy')
    || typeof address !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) {
    return null;
  }
  return { host: address, port };
}

function inspectContainer(socketPath, container) {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({
      socketPath,
      path: `/containers/${encodeURIComponent(container)}/json`,
      method: 'GET',
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 1024 * 1024) {
          outgoing.destroy(new Error('Docker inspect response exceeded limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (response.statusCode === 404) {
          resolve(null);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Docker inspect returned HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}

export function createDockerTargetResolver({
  socketPath = '/var/run/docker.sock',
  cacheMs = 1000,
  inspect = (container) => inspectContainer(socketPath, container),
} = {}) {
  const cache = new Map();
  return async (pr, { fresh = false, service = 'web' } = {}) => {
    const now = Date.now();
    const cacheKey = `${service}:${pr}`;
    const cached = cache.get(cacheKey);
    if (!fresh && cached && cached.expires > now) return cached.target;
    const container = service === 'blackboard'
      ? `yawp-pr-${pr}-blackboard-lti-mock-1`
      : `yawp-pr-${pr}-web-1`;
    const port = service === 'blackboard' ? 9473 : 8080;
    try {
      const target = targetFromDockerInspect(await inspect(container), port);
      cache.set(cacheKey, { target, expires: now + (target ? cacheMs : Math.min(cacheMs, 250)) });
      return target;
    } catch (error) {
      console.error(`Preview pr-${pr} target resolution failed`, error.message);
      return null;
    }
  };
}

export function createHttpRedirectHandler({ domain, readChallenge }) {
  const challengePrefix = '/.well-known/acme-challenge/';
  return async (request, response) => {
    const rawHost = Array.isArray(request.headers.host)
      ? request.headers.host[0]
      : request.headers.host || '';
    if (isStatusHost(rawHost, domain)) {
      response.writeHead(308, { location: `https://status.${domain.toLowerCase()}${request.url || '/'}` });
      response.end();
      return;
    }
    const parsed = parsePreviewHost(rawHost, domain);
    if (parsed === null) {
      send(response, 404, 'Not found.\n');
      return;
    }
    if (request.url?.startsWith(challengePrefix)) {
      const token = request.url.slice(challengePrefix.length);
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(token)) {
        send(response, 404, 'Not found.\n');
        return;
      }
      const keyAuthorization = await readChallenge(token);
      if (typeof keyAuthorization !== 'string' || !keyAuthorization) {
        send(response, 404, 'Not found.\n');
        return;
      }
      send(response, 200, keyAuthorization, { 'cache-control': 'no-store' });
      return;
    }
    const hostname = previewServiceHostname(parsed.pr, domain, parsed.service);
    response.writeHead(308, { location: `https://${hostname}${request.url || '/'}` });
    response.end();
  };
}

function certificatePaths(certRoot, hostname) {
  return {
    key: path.join(certRoot, hostname, 'privkey.pem'),
    cert: path.join(certRoot, hostname, 'fullchain.pem'),
  };
}

function wildcardCertificateStorageName(domain) {
  return `_wildcard.${domain}`;
}

function loadCertificatePair(certRoot, hostname) {
  const paths = certificatePaths(certRoot, hostname);
  return {
    key: readFileSync(paths.key),
    cert: readFileSync(paths.cert),
    version: `${statSync(paths.key).mtimeMs}:${statSync(paths.cert).mtimeMs}`,
  };
}

function publicKeyDer(key) {
  return createPublicKey(key).export({ type: 'spki', format: 'der' });
}

function validCertificatePair({ hostname, key, cert, now = Date.now() }) {
  try {
    const certificate = new X509Certificate(cert);
    const validationHostname = hostname.startsWith('*.') ? `wildcard-probe.${hostname.slice(2)}` : hostname;
    if (!certificate.checkHost(validationHostname)) return false;
    const validFrom = Date.parse(certificate.validFrom);
    const validTo = Date.parse(certificate.validTo);
    if (!Number.isFinite(validFrom) || !Number.isFinite(validTo) || now < validFrom || now >= validTo) {
      return false;
    }
    const privatePublic = publicKeyDer(createPrivateKey(key));
    const certificatePublic = certificate.publicKey.export({ type: 'spki', format: 'der' });
    return Buffer.from(privatePublic).equals(Buffer.from(certificatePublic));
  } catch {
    return false;
  }
}

async function findDefaultHostname(certRoot, domain) {
  const wildcardName = wildcardCertificateStorageName(domain);
  try {
    await stat(path.join(certRoot, wildcardName, 'fullchain.pem'));
    await stat(path.join(certRoot, wildcardName, 'privkey.pem'));
    return wildcardName;
  } catch {
    // Fall back to a resident exact certificate during migration.
  }
  const entries = await readdir(certRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && parsePreviewHost(entry.name, domain)?.service === 'web')
    .map((entry) => entry.name)
    .sort((a, b) => parsePreviewPr(b, domain) - parsePreviewPr(a, domain))[0] || null;
}

export function createCertificateStore({ certRoot, domain, defaultHostname }) {
  const cache = new Map();
  function pairByName(storageName, hostname = storageName) {
    try {
      const loaded = loadCertificatePair(certRoot, storageName.toLowerCase());
      if (!validCertificatePair({ hostname, ...loaded })) return null;
      const cached = cache.get(storageName);
      if (cached?.version === loaded.version) return cached;
      const value = { ...loaded, context: createSecureContext(loaded) };
      cache.set(storageName, value);
      return value;
    } catch {
      return null;
    }
  }
  function pair(hostname) {
    if (parsePreviewPr(hostname, domain) === null) return null;
    return pairByName(wildcardCertificateStorageName(domain), `*.${domain}`)
      || pairByName(hostname, hostname);
  }
  const defaultPair = pairByName(
    defaultHostname,
    defaultHostname === wildcardCertificateStorageName(domain) ? `*.${domain}` : defaultHostname,
  );
  if (!defaultPair) throw new Error(`No valid default certificate found for ${defaultHostname}`);
  return {
    defaultPair,
    sniCallback(servername, callback) {
      const hostname = String(servername || '').toLowerCase();
      const match = isStatusHost(hostname, domain)
        ? pairByName(wildcardCertificateStorageName(domain), `*.${domain}`)
        : pair(hostname);
      if (match) callback(null, match.context);
      else callback(new Error('No certificate provisioned for preview hostname'));
    },
  };
}

if (isDirectExecution(import.meta.url)) {
  const root = process.env.PREVIEW_ROOT || '/srv/yawp-preview';
  const domain = process.env.PREVIEW_DOMAIN || '';
  const certRoot = process.env.PREVIEW_CERT_ROOT || path.join(root, 'ingress', 'certs');
  const httpPort = Number(process.env.PREVIEW_HTTP_PORT || '80');
  const httpsPort = Number(process.env.PREVIEW_HTTPS_PORT || '443');
  const bind = process.env.PREVIEW_INGRESS_BIND || '0.0.0.0';
  const maxRunning = process.env.PREVIEW_MAX_RUNNING || '8';
  const maxConcurrentWakes = Number(process.env.PREVIEW_MAX_CONCURRENT_WAKES || '2');
  const wakeScript = process.env.PREVIEW_WAKE_SCRIPT
    || path.join(root, 'bootstrap', 'scripts', 'preview', 'wake-preview.sh');
  const defaultHostname = process.env.PREVIEW_TLS_DEFAULT_HOST
    || await findDefaultHostname(certRoot, domain);
  if (!defaultHostname) throw new Error('Preview ingress requires at least one provisioned certificate');

  const operations = createDefaultWakeOperations({ root, wakeScript, maxRunning });
  const resolveTarget = createDockerTargetResolver();
  const ingress = createPreviewIngress({
    domain,
    resolveTarget,
    maxConcurrentWakes,
    plainWakeEnabled: process.env.PREVIEW_PLAIN_WAKE_ENABLED === 'true',
    ...operations,
  });
  const upgrades = createWebSocketUpgradeHandler({
    domain,
    resolveTarget,
    maxConcurrentWakes,
    ...operations,
  });
  const certificateStore = createCertificateStore({ certRoot, domain, defaultHostname });
  const tlsServer = createSecureServer({
    key: certificateStore.defaultPair.key,
    cert: certificateStore.defaultPair.cert,
    SNICallback: certificateStore.sniCallback,
  }, ingress);
  tlsServer.on('upgrade', upgrades);
  tlsServer.listen(httpsPort, bind, () => {
    console.log(`Yawp preview HTTPS ingress listening on ${bind}:${httpsPort}`);
  });

  const challengeRoot = path.join(root, 'ingress', 'challenges');
  const redirect = createServer(createHttpRedirectHandler({
    domain,
    readChallenge: async (token) => {
      try {
        const target = path.join(challengeRoot, token);
        const info = await stat(target);
        if (!info.isFile() || info.size > 8192) return null;
        return (await readFile(target, 'utf8')).trim();
      } catch {
        return null;
      }
    },
  }));
  redirect.listen(httpPort, bind, () => {
    console.log(`Yawp preview HTTP redirect and ACME service listening on ${bind}:${httpPort}`);
  });
}
