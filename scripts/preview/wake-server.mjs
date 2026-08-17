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
  credentialIsCurrent = async () => false,
}) {
  try {
    const seats = JSON.parse(await readFile(
      path.join(root, 'previews', `pr-${pr}`, 'access-seats.json'),
      'utf8',
    ));
    const master = Array.isArray(seats) ? seats[0] : null;
    const masterCode = String(master?.code || '').trim().toLowerCase();
    const masterOrganizationId = String(master?.organizationId || '').trim();
    if (
      !/^[a-z]+-[a-z]+-[1-9][0-9]{3}$/.test(masterCode)
      || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(masterOrganizationId)
    ) return false;
    const url = new URL(trustedUri(uri), 'https://preview.invalid');
    const candidate = String(url.searchParams.get('code') || '').trim().toLowerCase();
    if (/^[a-z]+-[a-z]+-[1-9][0-9]{3}$/.test(candidate)) {
      if (safeSecretEqual(candidate, masterCode)) {
        if (await credentialIsCurrent({
          pr,
          organizationId: masterOrganizationId,
          requirePreviewSeatCode: false,
        })) return true;
      } else if (await credentialIsCurrent({ pr, code: candidate })) {
        return true;
      }
    }
    const secret = (await readFile(
      path.join(root, 'previews', `pr-${pr}`, 'access-secret'),
      'utf8',
    )).trim();
    if (secret.length < 32) return false;
    const organizationId = signedAccessCookieSeat(cookieHeader, secret, nowSeconds);
    if (organizationId === null) return false;
    return credentialIsCurrent({
      pr,
      organizationId,
      requirePreviewSeatCode: organizationId !== masterOrganizationId,
    });
  } catch {
    return false;
  }
}

async function resolveMatchingPreviewAccessCredential({
  root,
  pr,
  uri,
  cookieHeader,
  nowSeconds = Math.floor(Date.now() / 1000),
  resolveCredential,
}) {
  try {
    const seats = JSON.parse(await readFile(
      path.join(root, 'previews', `pr-${pr}`, 'access-seats.json'),
      'utf8',
    ));
    const master = Array.isArray(seats) ? seats[0] : null;
    const masterCode = String(master?.code || '').trim().toLowerCase();
    const masterOrganizationId = String(master?.organizationId || '').trim();
    if (
      !/^[a-z]+-[a-z]+-[1-9][0-9]{3}$/.test(masterCode)
      || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(masterOrganizationId)
    ) return null;
    const secret = (await readFile(
      path.join(root, 'previews', `pr-${pr}`, 'access-secret'),
      'utf8',
    )).trim();
    if (secret.length < 32) return null;
    const url = new URL(trustedUri(uri), 'https://preview.invalid');
    const candidate = String(url.searchParams.get('code') || '').trim().toLowerCase();
    if (/^[a-z]+-[a-z]+-[1-9][0-9]{3}$/.test(candidate)) {
      const resolved = safeSecretEqual(candidate, masterCode)
        ? await resolveCredential({
          pr,
          organizationId: masterOrganizationId,
          requirePreviewSeatCode: false,
        })
        : await resolveCredential({ pr, code: candidate });
      if (resolved) {
        return {
          ...resolved,
          requirePreviewSeatCode: !safeSecretEqual(candidate, masterCode),
          credentialDigest: createHmac('sha256', secret).update(candidate).digest('hex'),
        };
      }
    }
    const organizationId = signedAccessCookieSeat(cookieHeader, secret, nowSeconds);
    if (organizationId === null) return null;
    return resolveCredential({
      pr,
      organizationId,
      requirePreviewSeatCode: organizationId !== masterOrganizationId,
    });
  } catch {
    return null;
  }
}

export function createPreviewSeatLookup({
  execFileFn = execFileAsync,
  postgresContainer = 'preview-postgres',
} = {}) {
  return async ({ pr, code, organizationId, requirePreviewSeatCode = true }) => {
    if (!Number.isSafeInteger(pr) || pr < 1) return false;
    let predicate;
    if (typeof code === 'string' && /^[a-z]+-[a-z]+-[1-9][0-9]{3}$/.test(code)) {
      predicate = `"previewSeatCode" = '${code}'`;
    } else if (
      typeof organizationId === 'string'
      && /^[a-z0-9][a-z0-9-]{0,127}$/.test(organizationId)
    ) {
      predicate = `"id" = '${organizationId}'${
        requirePreviewSeatCode ? ' AND "previewSeatCode" IS NOT NULL' : ''
      }`;
    } else {
      return false;
    }
    try {
      const database = `yawp_pr_${pr}`;
      const query = `SELECT EXISTS (SELECT 1 FROM "Organization" WHERE ${predicate})::int;`;
      const { stdout } = await execFileFn('docker', [
        'exec',
        postgresContainer,
        'psql',
        '--no-psqlrc',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        database,
        '-tAc',
        query,
      ], {
        timeout: 10_000,
        maxBuffer: 64 * 1024,
      });
      return String(stdout).trim() === '1';
    } catch {
      return false;
    }
  };
}

function createPreviewSeatResolver({
  execFileFn = execFileAsync,
  postgresContainer = 'preview-postgres',
} = {}) {
  return async ({ pr, code, organizationId, requirePreviewSeatCode = true }) => {
    if (!Number.isSafeInteger(pr) || pr < 1) return null;
    let predicate;
    if (typeof code === 'string' && /^[a-z]+-[a-z]+-[1-9][0-9]{3}$/.test(code)) {
      predicate = `"previewSeatCode" = '${code}'`;
    } else if (
      typeof organizationId === 'string'
      && /^[a-z0-9][a-z0-9-]{0,127}$/.test(organizationId)
    ) {
      predicate = `"id" = '${organizationId}'${
        requirePreviewSeatCode ? ' AND "previewSeatCode" IS NOT NULL' : ''
      }`;
    } else {
      return null;
    }
    try {
      const database = `yawp_pr_${pr}`;
      const query = `SELECT "id" FROM "Organization" WHERE ${predicate} LIMIT 1;`;
      const { stdout } = await execFileFn('docker', [
        'exec',
        postgresContainer,
        'psql',
        '--no-psqlrc',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        database,
        '-tAc',
        query,
      ], {
        timeout: 10_000,
        maxBuffer: 64 * 1024,
      });
      const resolvedOrganizationId = String(stdout).trim();
      if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(resolvedOrganizationId)) return null;
      return {
        organizationId: resolvedOrganizationId,
        requirePreviewSeatCode: resolvedOrganizationId !== organizationId
          ? true
          : requirePreviewSeatCode,
      };
    } catch {
      return null;
    }
  };
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function acceptsHtml(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  return String(request.headers.accept || '')
    .toLowerCase()
    .split(',')
    .some((range) => {
      const [mediaType, ...parameters] = range.split(';').map((part) => part.trim());
      if (mediaType !== 'text/html' && mediaType !== 'application/xhtml+xml') return false;
      const qualityParameter = parameters.find((parameter) => parameter.startsWith('q='));
      if (!qualityParameter) return true;
      const quality = Number(qualityParameter.slice(2));
      return Number.isFinite(quality) && quality > 0 && quality <= 1;
    });
}

export function renderSleepingPreviewPage({ pr, uri }) {
  const url = new URL(trustedUri(uri), 'https://preview.invalid');
  const invalidCode = url.searchParams.has('code');
  const hiddenFields = [...url.searchParams.entries()]
    .filter(([name]) => name !== 'code')
    .map(([name, value]) => (
      `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`
    ))
    .join('\n          ');
  const preservedFields = hiddenFields ? `\n          ${hiddenFields}` : '';
  const invalidAttributes = invalidCode
    ? ' aria-invalid="true" aria-describedby="preview-access-error" autofocus'
    : '';
  const invalidMessage = invalidCode
    ? '\n          <p id="preview-access-error" class="error" role="alert">That code did not work. Check the pull request and try again.</p>'
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow, noarchive">
    <title>Sleeping preview | YAWP!</title>
    <style>
      :root {
        color-scheme: light;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-synthesis: none;
        --canvas: hsl(47 36% 95%);
        --surface: hsl(48 100% 99%);
        --text: hsl(48 20% 20%);
        --muted: hsl(50 7% 42%);
        --primary: hsl(15 59% 45%);
        --primary-hover: hsl(15 59% 40%);
        --ring: hsl(210 75% 49%);
        --line: hsl(48 12% 78% / 0.72);
        --radius: 1.25rem;
        background: var(--canvas);
        color: var(--text);
      }
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 20rem; }
      main {
        align-items: center;
        display: flex;
        justify-content: center;
        min-height: 100dvh;
        padding: clamp(1.25rem, 5vw, 4rem);
      }
      section {
        background: var(--surface);
        border-radius: var(--radius);
        box-shadow: 0 1.5rem 4rem hsl(45 20% 20% / 0.12);
        max-width: 27rem;
        padding: clamp(1.5rem, 6vw, 2.5rem);
        width: 100%;
      }
      .mark {
        align-items: center;
        background: var(--primary);
        border-radius: 999px;
        color: white;
        display: flex;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 1.35rem;
        font-weight: 600;
        height: 3.5rem;
        justify-content: center;
        letter-spacing: -0.04em;
        width: 3.5rem;
      }
      .eyebrow {
        color: var(--primary);
        font-size: 0.8125rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        margin: 1.5rem 0 0;
      }
      h1 {
        font-size: clamp(1.75rem, 7vw, 2.25rem);
        font-weight: 600;
        letter-spacing: -0.035em;
        margin: 0.45rem 0 0;
        text-wrap: balance;
      }
      .description {
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.6;
        margin: 0.85rem 0 0;
        text-wrap: pretty;
      }
      form {
        border-top: 1px solid var(--line);
        display: grid;
        gap: 0.75rem;
        margin-top: 1.75rem;
        padding-top: 1.5rem;
      }
      label { font-size: 0.925rem; font-weight: 600; }
      input[type="text"] {
        appearance: none;
        background: white;
        border: 1px solid hsl(48 12% 52%);
        border-radius: 0.625rem;
        color: var(--text);
        font: 1rem/1.25 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        min-height: 3rem;
        padding: 0.75rem;
        width: 100%;
      }
      input[type="text"]:focus-visible {
        border-color: var(--ring);
        outline: 2px solid var(--ring);
        outline-offset: -1px;
      }
      button {
        background: var(--primary);
        border: 0;
        border-radius: 0.625rem;
        color: white;
        cursor: pointer;
        font: 600 1rem/1.25 ui-sans-serif, system-ui, sans-serif;
        min-height: 3rem;
        padding: 0.75rem 1rem;
      }
      button:hover { background: var(--primary-hover); }
      button:focus-visible { outline: 3px solid var(--ring); outline-offset: 3px; }
      .help {
        color: var(--muted);
        font-size: 0.875rem;
        line-height: 1.55;
        margin: 1.25rem 0 0;
      }
      .error {
        background: hsl(0 52% 42% / 0.09);
        border-radius: 0.5rem;
        color: hsl(0 52% 36%);
        font-size: 0.875rem;
        line-height: 1.5;
        margin: 0;
        padding: 0.625rem 0.75rem;
      }
      @media (max-width: 30rem) {
        main { align-items: stretch; padding: 0; }
        section {
          border-radius: 0;
          box-shadow: none;
          max-width: none;
          padding: 2rem 1.25rem;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { scroll-behavior: auto !important; }
      }
    </style>
  </head>
  <body>
    <main>
      <section aria-labelledby="sleeping-preview-title">
        <div class="mark" aria-hidden="true">Y!</div>
        <p class="eyebrow">PR ${pr} preview</p>
        <h1 id="sleeping-preview-title">This preview is sleeping</h1>
        <p class="description">Use the one-click link in the pull request to wake and authorize this browser automatically. In a fresh, private, or different browser, open that link or enter the access code here once.</p>
        <form method="get" action="${escapeHtml(url.pathname)}">
          <label for="preview-access-code">Access code</label>
          <input id="preview-access-code" name="code" type="text" autocomplete="one-time-code" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="brave-otter-4193" required${invalidAttributes}>${invalidMessage}${preservedFields}
          <button type="submit">Wake preview</button>
        </form>
        <p class="help">Your preview state is preserved while it sleeps. Startup can take up to a minute.</p>
      </section>
    </main>
  </body>
</html>`;
}

function sendSleepingPreviewPage(response, { pr, uri }) {
  response.statusCode = 401;
  response.setHeader('cache-control', 'no-store');
  response.setHeader(
    'content-security-policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-content-type-options', 'nosniff');
  response.end(renderSleepingPreviewPage({ pr, uri }));
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
      const authorization = await authorizeWake(pr, uri, request);
      if (!authorization) {
        if (acceptsHtml(request)) sendSleepingPreviewPage(response, { pr, uri });
        else send(response, 401, 'Open this sleeping preview with its one-click access URL.\n');
        return;
      }
      await wake(pr, {
        allowDisplacement: true,
        ...(typeof authorization === 'object' ? { authorization } : {}),
      });
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
      } else if (error?.code === 'deploying') {
        response.setHeader('retry-after', '30');
        send(response, 503, 'Preview deployment is in progress; retry shortly.\n');
      } else if (error?.code === 'authorization-stale') {
        response.setHeader('retry-after', '30');
        send(response, 503, 'Preview authorization expired while queued; retry.\n');
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
      // This process is only a reader. It must never truncate a file while Traefik can
      // append to it; writer-coordinated host maintenance owns any future rotation.
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
  if (/deployment (?:is in progress|is quarantined)/i.test(message)) error.code = 'deploying';
  else if (/authorization (?:expired|was revoked) while queued/i.test(message)) error.code = 'authorization-stale';
  else if (/capacity/i.test(message)) error.code = 'capacity-full';
  else if (/not resident/i.test(message)) error.code = 'not-resident';
  return error;
}

export function createDefaultWakeOperations({
  root,
  wakeScript,
  maxRunning,
  commandTimeoutMs = wakeCommandTimeoutMs(),
  credentialIsCurrent = createPreviewSeatLookup(),
  credentialResolver = createPreviewSeatResolver(),
}) {
  const recentAccess = new Map();
  const accessWrites = new Map();
  return {
    async ensureRunning(pr, { allowDisplacement = false, authorization } = {}) {
      const organizationId = String(authorization?.organizationId || '');
      const requirePreviewSeatCode = authorization?.requirePreviewSeatCode;
      const credentialDigest = String(authorization?.credentialDigest || '');
      if (
        authorization
        && (
          !/^[a-z0-9][a-z0-9-]{0,127}$/.test(organizationId)
          || typeof requirePreviewSeatCode !== 'boolean'
          || (credentialDigest && !/^[a-f0-9]{64}$/.test(credentialDigest))
        )
      ) {
        throw new Error('Preview wake authorization descriptor is invalid');
      }
      try {
        const { stdout } = await execFileAsync('bash', [wakeScript, String(pr)], {
          env: {
            ...process.env,
            PREVIEW_ROOT: root,
            PREVIEW_MAX_RUNNING: String(maxRunning),
            PREVIEW_WAKE_ALLOW_DISPLACEMENT: allowDisplacement ? 'true' : 'false',
            PREVIEW_WAKE_AUTHORIZED_AT_EPOCH: String(Math.floor(Date.now() / 1000)),
            PREVIEW_WAKE_AUTHORIZED_ORGANIZATION_ID: organizationId,
            PREVIEW_WAKE_REQUIRE_PREVIEW_SEAT_CODE: authorization
              ? String(requirePreviewSeatCode)
              : '',
            PREVIEW_WAKE_AUTHORIZED_CODE_HMAC_SHA256: credentialDigest,
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
      return resolveMatchingPreviewAccessCredential({
        root,
        pr,
        uri,
        cookieHeader: request?.headers?.cookie,
        resolveCredential: credentialResolver,
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
  const maxConcurrentWakes = Number(process.env.PREVIEW_MAX_CONCURRENT_WAKES || '2');
  const port = Number(process.env.PREVIEW_WAKE_PORT || '9876');
  const bind = process.env.PREVIEW_WAKE_BIND || '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PREVIEW_WAKE_PORT must be a valid TCP port');
  }
  if (!Number.isSafeInteger(maxConcurrentWakes) || maxConcurrentWakes < 1) {
    throw new Error('PREVIEW_MAX_CONCURRENT_WAKES must be a positive integer');
  }
  const operations = createDefaultWakeOperations({ root, wakeScript, maxRunning });
  startAccessLogFollower({
    accessLog,
    domain,
    recordAccess: operations.recordAccess,
  });
  createServer(createWakeHandler({ domain, secret, maxConcurrentWakes, ...operations })).listen(port, bind, () => {
    console.log(`Yawp preview wake service listening on ${bind}:${port}`);
  });
}
