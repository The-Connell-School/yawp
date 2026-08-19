import { request as httpRequest, createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { readFile, readdir, stat } from 'node:fs/promises';
import { readFileSync, statSync } from 'node:fs';
import { connect as netConnect } from 'node:net';
import { createSecureContext } from 'node:tls';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  createDefaultWakeOperations,
  parsePreviewPr,
} from './wake-server.mjs';

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
  console.error('Preview wake failed', error);
  return [503, 'Preview is temporarily unavailable; retry shortly.\n'];
}

function createWakeCoordinator({ ensureRunning, maxConcurrentWakes }) {
  if (!Number.isSafeInteger(maxConcurrentWakes) || maxConcurrentWakes < 1) {
    throw new Error('maxConcurrentWakes must be a positive integer');
  }
  const inFlight = new Map();
  return async (pr, authorization) => {
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
        .then(() => ensureRunning(pr, options))
        .finally(() => inFlight.delete(pr));
      inFlight.set(pr, operation);
    }
    return inFlight.get(pr);
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
      const authorized = String(upstreamResponse.headers['x-yawp-preview-authorized'] || '') === '1';
      const status = upstreamResponse.statusCode || 503;
      response.writeHead(status, downstreamHeaders(upstreamResponse.headers));
      upstreamResponse.pipe(response);
      upstreamResponse.once('end', () => {
        if (
          authorized
          && status < 400
          && request.method !== 'HEAD'
          && request.method !== 'OPTIONS'
        ) {
          Promise.resolve(recordAccess(pr)).catch((error) => {
            console.error('Preview activity recording failed', error);
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
  recordAccess,
  maxConcurrentWakes = 2,
}) {
  if (!domain) throw new Error('preview ingress domain is required');
  const wake = createWakeCoordinator({ ensureRunning, maxConcurrentWakes });

  return async (request, response) => {
    const rawHost = Array.isArray(request.headers.host)
      ? request.headers.host[0]
      : request.headers.host || '';
    const pr = parsePreviewPr(rawHost, domain);
    if (pr === null) {
      send(response, 404, 'Not found.\n');
      return;
    }
    const hostname = `pr-${pr}.${domain.toLowerCase()}`;
    let target = await resolveTarget(pr);
    if (!target) {
      try {
        const authorization = await authorizeWake(pr, request.url, request);
        if (!authorization) {
          send(response, 401, 'Open this sleeping preview with its one-click access URL.\n');
          return;
        }
        await wake(pr, authorization);
        target = await resolveTarget(pr, { fresh: true });
        if (!target) {
          send(response, 503, 'Preview is starting; retry shortly.\n', { 'retry-after': '5' });
          return;
        }
      } catch (error) {
        const [status, body] = wakeErrorResponse(error);
        send(response, status, body, status === 503 ? { 'retry-after': '15' } : {});
        return;
      }
    }
    await proxyHttp({ request, response, target, hostname, pr, recordAccess });
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
  recordAccess = async () => {},
  maxConcurrentWakes = 2,
  connectTarget = netConnect,
}) {
  const wake = createWakeCoordinator({ ensureRunning, maxConcurrentWakes });
  return async (request, socket, head) => {
    socket.on('error', () => {});
    socket.resume();
    const rawHost = Array.isArray(request.headers.host)
      ? request.headers.host[0]
      : request.headers.host || '';
    const pr = parsePreviewPr(rawHost, domain);
    if (pr === null) {
      writeSocketResponse(socket, '404 Not Found', 'Not found.\n');
      return;
    }
    const hostname = `pr-${pr}.${domain.toLowerCase()}`;
    let target = await resolveTarget(pr);
    if (!target) {
      try {
        const authorization = await authorizeWake(pr, request.url, request);
        if (!authorization) {
          writeSocketResponse(socket, '401 Unauthorized', 'Open this sleeping preview with its one-click access URL.\n');
          return;
        }
        await wake(pr, authorization);
        target = await resolveTarget(pr, { fresh: true });
      } catch (error) {
        const [status, body] = wakeErrorResponse(error);
        writeSocketResponse(socket, `${status} Service Unavailable`, body);
        return;
      }
    }
    if (!target) {
      writeSocketResponse(socket, '503 Service Unavailable', 'Preview is starting; retry shortly.\n');
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
        const authorized = lines.some((line) => /^x-yawp-preview-authorized:\s*1\s*$/i.test(line));
        const sanitized = lines.filter((line) => !/^x-yawp-preview-authorized:/i.test(line));
        socket.write(`${sanitized.join('\r\n')}\r\n\r\n`);
        if (remainder.length) socket.write(remainder);
        responsePreamble = Buffer.alloc(0);
        responseHeadersComplete = true;
        if (authorized && /^HTTP\/1\.[01] 101\b/.test(lines[0] || '')) {
          Promise.resolve(recordAccess(pr)).catch((error) => {
            console.error('Preview activity recording failed', error);
          });
        }
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

export function targetFromDockerInspect(inspect) {
  const address = inspect?.NetworkSettings?.Networks?.preview?.IPAddress;
  if (!inspect?.State?.Running || typeof address !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) {
    return null;
  }
  return { host: address, port: 8080 };
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
  return async (pr, { fresh = false } = {}) => {
    const now = Date.now();
    const cached = cache.get(pr);
    if (!fresh && cached && cached.expires > now) return cached.target;
    try {
      const target = targetFromDockerInspect(await inspect(`yawp-pr-${pr}-web-1`));
      cache.set(pr, { target, expires: now + (target ? cacheMs : Math.min(cacheMs, 250)) });
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
    const pr = parsePreviewPr(rawHost, domain);
    if (pr === null) {
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
    const hostname = `pr-${pr}.${domain.toLowerCase()}`;
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

function loadCertificatePair(certRoot, hostname) {
  const paths = certificatePaths(certRoot, hostname);
  return {
    key: readFileSync(paths.key),
    cert: readFileSync(paths.cert),
    version: `${statSync(paths.key).mtimeMs}:${statSync(paths.cert).mtimeMs}`,
  };
}

async function findDefaultHostname(certRoot, domain) {
  const entries = await readdir(certRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && parsePreviewPr(entry.name, domain) !== null)
    .map((entry) => entry.name)
    .sort((a, b) => parsePreviewPr(b, domain) - parsePreviewPr(a, domain))[0] || null;
}

export function createCertificateStore({ certRoot, domain, defaultHostname }) {
  const cache = new Map();
  function pair(hostname) {
    if (parsePreviewPr(hostname, domain) === null) return null;
    try {
      const loaded = loadCertificatePair(certRoot, hostname.toLowerCase());
      const cached = cache.get(hostname);
      if (cached?.version === loaded.version) return cached;
      const value = { ...loaded, context: createSecureContext(loaded) };
      cache.set(hostname, value);
      return value;
    } catch {
      return null;
    }
  }
  const defaultPair = pair(defaultHostname);
  if (!defaultPair) throw new Error(`No valid default certificate found for ${defaultHostname}`);
  return {
    defaultPair,
    sniCallback(servername, callback) {
      const match = pair(String(servername || '').toLowerCase());
      if (match) callback(null, match.context);
      else callback(new Error('No certificate provisioned for preview hostname'));
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.env.PREVIEW_ROOT || '/srv/yawp-preview';
  const domain = process.env.PREVIEW_DOMAIN || '';
  const certRoot = process.env.PREVIEW_CERT_ROOT || path.join(root, 'ingress', 'certs');
  const httpPort = Number(process.env.PREVIEW_HTTP_PORT || '80');
  const httpsPort = Number(process.env.PREVIEW_HTTPS_PORT || '443');
  const bind = process.env.PREVIEW_INGRESS_BIND || '0.0.0.0';
  const maxRunning = process.env.PREVIEW_MAX_RUNNING || '4';
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
