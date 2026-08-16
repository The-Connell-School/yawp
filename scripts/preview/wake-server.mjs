import { execFile } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ACCESS_SEAT_VALUE_PREFIX = 'seat-v2:';
const ACCESS_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const ACCESS_COOKIE_CLOCK_SKEW_SECONDS = 5 * 60;

function safeSecretEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return actualBuffer.length === expectedBuffer.length
    && actualBuffer.length > 0
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parsePreviewPr(host, domain) {
  if (typeof host !== 'string' || typeof domain !== 'string' || !domain) return null;
  const hostname = host.toLowerCase().replace(/:\d+$/, '');
  const match = hostname.match(new RegExp(`^pr-([1-9][0-9]*)\\.${escapeRegex(domain.toLowerCase())}$`));
  if (!match) return null;
  const pr = Number(match[1]);
  return Number.isSafeInteger(pr) ? pr : null;
}

function nonnegativeInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a nonnegative integer`);
  }
  return parsed;
}

export function wakeCommandTimeoutMs(env = process.env) {
  const lockSeconds = nonnegativeInteger(env.PREVIEW_LOCK_WAIT_SECONDS, 900, 'PREVIEW_LOCK_WAIT_SECONDS');
  const healthAttempts = nonnegativeInteger(env.PREVIEW_WAKE_HEALTH_ATTEMPTS, 60, 'PREVIEW_WAKE_HEALTH_ATTEMPTS');
  const healthInterval = nonnegativeInteger(
    env.PREVIEW_WAKE_HEALTH_INTERVAL_SECONDS,
    1,
    'PREVIEW_WAKE_HEALTH_INTERVAL_SECONDS',
  );
  // Shell owns the bounded lock and health phases. A failed target can consume one
  // complete health window before rollback consumes another restoring displacement.
  // Keep the parent alive through both, plus cleanup time.
  return (lockSeconds + (2 * healthAttempts * healthInterval) + 60) * 1000;
}

function signedAccessCookieSeat(cookieHeader, secret, nowSeconds) {
  try {
    const raw = String(cookieHeader || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('__yawp_preview_access='));
    if (!raw) return null;
    const cookie = decodeURIComponent(raw.slice(raw.indexOf('=') + 1));
    const separator = cookie.lastIndexOf('.');
    if (separator < 1) return null;
    const value = cookie.slice(0, separator);
    const signature = cookie.slice(separator + 1);
    const expected = createHmac('sha256', secret)
      .update(value)
      .digest('base64')
      .replace(/=+$/, '');
    if (!safeSecretEqual(signature, expected)) return null;
    const decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    if (
      typeof decoded !== 'string'
      || !decoded.startsWith(ACCESS_SEAT_VALUE_PREFIX)
    ) return null;
    const payload = decoded.slice(ACCESS_SEAT_VALUE_PREFIX.length);
    const payloadSeparator = payload.indexOf(':');
    if (payloadSeparator < 1) return null;
    const issuedAtValue = payload.slice(0, payloadSeparator);
    if (!/^[1-9][0-9]*$/.test(issuedAtValue)) return null;
    const issuedAt = Number(issuedAtValue);
    if (
      !Number.isSafeInteger(issuedAt)
      || issuedAt > nowSeconds + ACCESS_COOKIE_CLOCK_SKEW_SECONDS
      || nowSeconds - issuedAt > ACCESS_COOKIE_MAX_AGE_SECONDS
    ) {
      return null;
    }
    const organizationId = payload.slice(payloadSeparator + 1);
    return /^[a-z0-9][a-z0-9-]{0,127}$/.test(organizationId)
      ? organizationId
      : null;
  } catch {
    return null;
  }
}

export async function hasMatchingPreviewAccessCredential({
  root,
  pr,
  uri,
  cookieHeader,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  try {
    const seats = JSON.parse(await readFile(
      path.join(root, 'previews', `pr-${pr}`, 'access-seats.json'),
      'utf8',
    ));
    if (!Array.isArray(seats)) return false;
    const url = new URL(trustedUri(uri), 'https://preview.invalid');
    const candidate = String(url.searchParams.get('code') || '').trim().toLowerCase();
    if (/^[a-z]+-[a-z]+-[1-9][0-9]{3}$/.test(candidate)) {
      if (
        seats.some((seat) => safeSecretEqual(
          candidate,
          String(seat?.code || '').trim().toLowerCase(),
        ))
      ) return true;
    }
    const secret = (await readFile(
      path.join(root, 'previews', `pr-${pr}`, 'access-secret'),
      'utf8',
    )).trim();
    if (secret.length < 32) return false;
    const organizationId = signedAccessCookieSeat(cookieHeader, secret, nowSeconds);
    return organizationId !== null && seats.some(
      (seat) => String(seat?.organizationId || '').trim() === organizationId,
    );
  } catch {
    return false;
  }
}

function trustedUri(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\r\n]/.test(value)) return '/';
  return value;
}

function send(response, status, body = '') {
  response.statusCode = status;
  response.setHeader('content-type', 'text/plain; charset=utf-8');
  response.end(body);
}

export function createWakeHandler({
  domain,
  secret,
  ensureRunning,
  recordAccess,
  authorizeWake = async () => false,
  maxConcurrentWakes = 2,
  redirectUrl = ({ hostname, uri }) => `https://${hostname}${uri}`,
}) {
  if (!domain || !secret) throw new Error('preview wake domain and secret are required');
  if (!Number.isSafeInteger(maxConcurrentWakes) || maxConcurrentWakes < 1) {
    throw new Error('maxConcurrentWakes must be a positive integer');
  }
  const inFlight = new Map();

  function wake(pr, options) {
    if (!inFlight.has(pr)) {
      if (inFlight.size >= maxConcurrentWakes) {
        const error = new Error('Preview wake concurrency is full');
        error.code = 'capacity-full';
        throw error;
      }
      const operation = Promise.resolve()
        .then(() => ensureRunning(pr, options))
        .finally(() => inFlight.delete(pr));
      inFlight.set(pr, operation);
    }
    return inFlight.get(pr);
  }

  return async (request, response) => {
    if (!safeSecretEqual(request.headers['x-preview-wake-secret'], secret)) {
      send(response, 403, 'Forbidden\n');
      return;
    }

    const forwardedHost = Array.isArray(request.headers['x-forwarded-host'])
      ? request.headers['x-forwarded-host'][0]
      : request.headers['x-forwarded-host'];
    const rawHost = forwardedHost || request.headers.host || '';
    const pr = parsePreviewPr(rawHost, domain);
    if (pr === null) {
      response.statusCode = 204;
      response.end();
      return;
    }

    const forwardedUri = Array.isArray(request.headers['x-forwarded-uri'])
      ? request.headers['x-forwarded-uri'][0]
      : request.headers['x-forwarded-uri'];
    const uri = trustedUri(forwardedUri || request.url);

    try {
      const authorized = await authorizeWake(pr, uri, request);
      if (!authorized) {
        send(response, 401, 'Open this sleeping preview with its one-click access URL.\n');
        return;
      }
      await wake(pr, { allowDisplacement: true });
      try {
        await recordAccess(pr);
      } catch (error) {
        console.error('Preview activity recording failed', error);
      }
      const hostname = `pr-${pr}.${domain.toLowerCase()}`;
      response.statusCode = 307;
      response.setHeader('location', redirectUrl({ hostname, uri }));
      response.end();
    } catch (error) {
      if (error?.code === 'capacity-full') {
        response.setHeader('retry-after', '30');
        send(response, 503, 'Preview capacity is full; retry shortly.\n');
      } else if (error?.code === 'not-resident') {
        send(response, 404, 'Preview is no longer resident.\n');
      } else {
        console.error('Preview wake failed', error);
        send(response, 500, 'Preview wake failed.\n');
      }
    }
  };
}

export function startAccessLogFollower({
  accessLog,
  domain,
  recordAccess,
  pollMs = 5000,
  maxBytes = 50 * 1024 * 1024,
}) {
  let initialized = false;
  let inode = null;
  let offset = 0;
  let scanning = false;
  let stopped = false;

  async function scan() {
    if (scanning || stopped) return;
    scanning = true;
    let handle;
    try {
      handle = await open(accessLog, 'r');
      const info = await handle.stat();
      if (!initialized) {
        initialized = true;
        inode = info.ino;
        offset = info.size;
        return;
      }
      if (inode !== info.ino || info.size < offset) {
        inode = info.ino;
        offset = 0;
      }
      if (info.size === offset) return;

      const buffer = Buffer.alloc(Math.min(info.size - offset, 1024 * 1024));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      const received = buffer.subarray(0, bytesRead);
      const lastNewline = received.lastIndexOf(0x0a);
      if (lastNewline < 0) {
        if (buffer.length === 1024 * 1024) offset += bytesRead;
        return;
      }
      offset += lastNewline + 1;

      const prs = new Set();
      for (const line of received.subarray(0, lastNewline).toString('utf8').split('\n')) {
        try {
          const entry = JSON.parse(line);
          const pr = parsePreviewPr(entry.RequestHost, domain);
          const method = String(entry.RequestMethod || 'GET').toUpperCase();
          const status = Number(entry.DownstreamStatus || entry.OriginStatus || 200);
          const authorized = String(
            entry['origin_X-Yawp-Preview-Authorized']
            || entry['downstream_X-Yawp-Preview-Authorized']
            || '',
          ) === '1';
          if (
            pr !== null
            && authorized
            && method !== 'HEAD'
            && method !== 'OPTIONS'
            && Number.isFinite(status)
            && status < 400
          ) prs.add(pr);
        } catch {
          // Ignore partial or malformed access-log entries; request routing is unaffected.
        }
      }
      const results = await Promise.allSettled([...prs].map((pr) => recordAccess(pr)));
      for (const result of results) {
        if (result.status === 'rejected') console.error('Preview activity recording failed', result.reason);
      }
      if (info.size > maxBytes && offset === info.size) {
        await writeFile(accessLog, '');
        offset = 0;
      }
    } catch (error) {
      if (error?.code === 'ENOENT') {
        initialized = true;
        inode = null;
        offset = 0;
      } else {
        console.error('Preview access-log scan failed', error);
      }
    } finally {
      await handle?.close().catch(() => {});
      scanning = false;
    }
  }

  void scan();
  const timer = setInterval(() => void scan(), pollMs);
  timer.unref?.();
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

function classifyWakeError(error) {
  const message = `${error?.stderr || ''}\n${error?.message || ''}`;
  if (/capacity/i.test(message)) error.code = 'capacity-full';
  else if (/not resident/i.test(message)) error.code = 'not-resident';
  return error;
}

export function createDefaultWakeOperations({
  root,
  wakeScript,
  maxRunning,
  commandTimeoutMs = wakeCommandTimeoutMs(),
}) {
  const recentAccess = new Map();
  const accessWrites = new Map();
  return {
    async ensureRunning(pr, { allowDisplacement = false } = {}) {
      try {
        const { stdout } = await execFileAsync('bash', [wakeScript, String(pr)], {
          env: {
            ...process.env,
            PREVIEW_ROOT: root,
            PREVIEW_MAX_RUNNING: String(maxRunning),
            PREVIEW_WAKE_ALLOW_DISPLACEMENT: allowDisplacement ? 'true' : 'false',
          },
          timeout: commandTimeoutMs,
          maxBuffer: 1024 * 1024,
        });
        return { result: stdout };
      } catch (error) {
        throw classifyWakeError(error);
      }
    },
    async authorizeWake(pr, uri, request) {
      return hasMatchingPreviewAccessCredential({
        root,
        pr,
        uri,
        cookieHeader: request?.headers?.cookie,
      });
    },
    async recordAccess(pr) {
      const now = Math.floor(Date.now() / 1000);
      if (now - (recentAccess.get(pr) || 0) < 30) return;
      if (accessWrites.has(pr)) return accessWrites.get(pr);
      const operation = (async () => {
        const accessDir = path.join(root, 'wake', 'access');
        await mkdir(accessDir, { recursive: true, mode: 0o700 });
        const target = path.join(accessDir, `pr-${pr}`);
        const temporary = `${target}.${process.pid}.${now}.tmp`;
        await writeFile(temporary, `${now}\n`, { mode: 0o600 });
        await rename(temporary, target);
        recentAccess.set(pr, now);
      })().finally(() => accessWrites.delete(pr));
      accessWrites.set(pr, operation);
      return operation;
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const domain = process.env.PREVIEW_DOMAIN || '';
  const secret = process.env.PREVIEW_WAKE_SECRET || '';
  const root = process.env.PREVIEW_ROOT || '/srv/yawp-preview';
  const maxRunning = process.env.PREVIEW_MAX_RUNNING || '4';
  const wakeScript = process.env.PREVIEW_WAKE_SCRIPT
    || path.join(root, 'bootstrap', 'scripts', 'preview', 'wake-preview.sh');
  const accessLog = process.env.PREVIEW_ACCESS_LOG
    || path.join(root, 'traefik', 'logs', 'access.json');
  const accessLogMaxBytes = Number(process.env.PREVIEW_ACCESS_LOG_MAX_BYTES || 50 * 1024 * 1024);
  const maxConcurrentWakes = Number(process.env.PREVIEW_MAX_CONCURRENT_WAKES || '2');
  const port = Number(process.env.PREVIEW_WAKE_PORT || '9876');
  const bind = process.env.PREVIEW_WAKE_BIND || '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PREVIEW_WAKE_PORT must be a valid TCP port');
  }
  if (!Number.isSafeInteger(accessLogMaxBytes) || accessLogMaxBytes < 1) {
    throw new Error('PREVIEW_ACCESS_LOG_MAX_BYTES must be a positive integer');
  }
  if (!Number.isSafeInteger(maxConcurrentWakes) || maxConcurrentWakes < 1) {
    throw new Error('PREVIEW_MAX_CONCURRENT_WAKES must be a positive integer');
  }
  const operations = createDefaultWakeOperations({ root, wakeScript, maxRunning });
  startAccessLogFollower({
    accessLog,
    domain,
    recordAccess: operations.recordAccess,
    maxBytes: accessLogMaxBytes,
  });
  createServer(createWakeHandler({ domain, secret, maxConcurrentWakes, ...operations })).listen(port, bind, () => {
    console.log(`Yawp preview wake service listening on ${bind}:${port}`);
  });
}
