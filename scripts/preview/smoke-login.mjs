import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

function request(url, { method = 'GET', body, headers = {} } = {}) {
  const target = new URL(url);
  const client = target.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      target,
      {
        method,
        headers: {
          ...headers,
          ...(body ? { 'content-length': Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.setTimeout(15_000, () => req.destroy(new Error(`Timed out: ${url}`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function appendPath(baseUrl, pathname) {
  const url = new URL(baseUrl);
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function getCookies(headers) {
  const raw = headers['set-cookie'];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.map((value) => value.split(';')[0]).filter(Boolean).join('; ');
}

function resolveRedirect(baseUrl, location) {
  if (!location) return null;
  return new URL(location, baseUrl).toString();
}

async function getWithRedirects(
  url,
  { cookie, maxRedirects = 3, requestFn = request } = {},
) {
  let currentUrl = url;
  const allowedOrigin = new URL(url).origin;
  for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
    const response = await requestFn(currentUrl, {
      headers: {
        ...(cookie ? { cookie } : {}),
      },
    });
    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const nextUrl = resolveRedirect(currentUrl, response.headers.location);
    if (!nextUrl) return response;
    if (new URL(nextUrl).origin !== allowedOrigin) {
      throw new Error(
        `Refusing cross-origin redirect during preview smoke: ${nextUrl}`,
      );
    }
    currentUrl = nextUrl;
  }

  throw new Error(`Too many redirects while checking ${url}`);
}

export async function enterPreviewAccess({
  baseUrl,
  accessCode,
  requestFn = request,
} = {}) {
  if (!baseUrl) throw new Error('baseUrl is required');
  if (!accessCode) throw new Error('accessCode is required');

  const anonymousPage = await requestFn(baseUrl);
  if (
    anonymousPage.status < 300 ||
    anonymousPage.status >= 400 ||
    !String(anonymousPage.headers.location || '').startsWith(
      '/auth/preview-access',
    )
  ) {
    throw new Error(
      `Expected anonymous app request to redirect to the access screen, got HTTP ${anonymousPage.status}`,
    );
  }

  const devLoginProbeBody = new URLSearchParams({
    email: 'dev.admin@yawp.local',
  }).toString();
  const blockedDevLogin = await requestFn(
    appendPath(baseUrl, '/auth/dev-login'),
    {
      method: 'POST',
      body: devLoginProbeBody,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    },
  );
  if (blockedDevLogin.status !== 401) {
    throw new Error(
      `Expected anonymous POST /auth/dev-login to return HTTP 401, got ${blockedDevLogin.status}`,
    );
  }

  const form = new URLSearchParams({ code: accessCode, returnTo: '/' }).toString();
  const access = await requestFn(
    appendPath(baseUrl, '/auth/preview-access'),
    {
      method: 'POST',
      body: form,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    },
  );
  if (access.status < 300 || access.status >= 400) {
    throw new Error(`Expected access-code redirect, got HTTP ${access.status}`);
  }

  const cookie = getCookies(access.headers);
  if (!cookie.includes('__yawp_preview_access=')) {
    throw new Error('Expected access code to set the preview access cookie');
  }
  return cookie;
}

export async function runLoginSmoke({
  baseUrl,
  email,
  password,
  accessCode,
  requestFn = request,
} = {}) {
  if (!baseUrl) throw new Error('baseUrl is required');
  if (!email || !password) throw new Error('email and password are required');
  const accessCookie = await enterPreviewAccess({
    baseUrl,
    accessCode,
    requestFn,
  });

  const form = new URLSearchParams({
    email,
    password,
    redirectTo: '/app',
  }).toString();

  const login = await requestFn(appendPath(baseUrl, '/auth/login'), {
    method: 'POST',
    body: form,
    headers: {
      cookie: accessCookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
  });

  if (login.status < 300 || login.status >= 400) {
    throw new Error(`Expected login redirect, got HTTP ${login.status}`);
  }

  const authCookies = getCookies(login.headers);
  if (!authCookies) {
    throw new Error('Expected login to set an auth cookie');
  }
  const cookies = `${accessCookie}; ${authCookies}`;

  const app = await getWithRedirects(appendPath(baseUrl, '/app'), {
    cookie: cookies,
    requestFn,
  });

  if (app.status !== 200) {
    throw new Error(`Expected /app to return HTTP 200 after login, got ${app.status}`);
  }

  return { ok: true, status: app.status };
}

export async function runDevLoginSmoke({
  baseUrl,
  email = 'dev.teacher@yawp.local',
  accessCode,
  requestFn = request,
} = {}) {
  if (!baseUrl) throw new Error('baseUrl is required');
  if (!email) throw new Error('email is required');
  const accessCookie = await enterPreviewAccess({
    baseUrl,
    accessCode,
    requestFn,
  });

  const form = new URLSearchParams({
    email,
    redirectTo: '/app',
  }).toString();

  const login = await requestFn(appendPath(baseUrl, '/auth/dev-login'), {
    method: 'POST',
    body: form,
    headers: {
      cookie: accessCookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
  });

  if (login.status < 300 || login.status >= 400) {
    throw new Error(`Expected dev login redirect, got HTTP ${login.status}`);
  }

  const authCookies = getCookies(login.headers);
  if (!authCookies) {
    throw new Error('Expected dev login to set an auth cookie');
  }
  const cookies = `${accessCookie}; ${authCookies}`;

  const app = await getWithRedirects(appendPath(baseUrl, '/app'), {
    cookie: cookies,
    requestFn,
  });

  if (app.status !== 200) {
    throw new Error(`Expected /app to return HTTP 200 after dev login, got ${app.status}`);
  }

  return { ok: true, status: app.status };
}

/**
 * Which login path a deployed environment actually supports. Dev login exists only on the
 * dev-server runtime; the production build path gates it off (isLocalDevAuthEnabled needs
 * NODE_ENV === 'development' and a local DATABASE_URL) and returns 403.
 */
export function shouldUseDevLogin({ dataMode, runtime } = {}) {
  return (dataMode ?? 'seed') === 'seed' && (runtime ?? 'fast') !== 'production';
}

async function main() {
  const baseUrl = (process.env.PREVIEW_BASE_URL || '').replace(/\/$/, '');
  const dataMode = process.env.PREVIEW_DATA_MODE || 'seed';
  const accessCode = process.env.PREVIEW_ACCESS_CODE || '';

  const runtime = process.env.PREVIEW_RUNTIME || 'fast';

  // Dev login is gated on NODE_ENV === 'development' AND a local DATABASE_URL
  // (isLocalDevAuthEnabled), so the production build path never exposes /auth/dev-login
  // no matter how the data was loaded — it returns 403. Selecting on data mode alone
  // assumed seeded data implies the dev-server runtime, which held until the demo box
  // became the first environment to run seeded data on the production runtime.
  //
  // Seeded personas carry a real password (LOCAL_DEV_PASSWORD in dev-personas.ts), so
  // password login works against seeded data; the credentials come from the environment
  // so nothing is hardcoded here.
  const canUseDevLogin = shouldUseDevLogin({ dataMode, runtime });

  try {
    if (canUseDevLogin) {
      const email =
        process.env.PREVIEW_DEV_LOGIN_EMAIL || 'dev.teacher@yawp.local';
      await runDevLoginSmoke({ baseUrl, email, accessCode });
      console.log(`OK preview dev login smoke: ${email} -> /app`);
    } else {
      const email = process.env.PREVIEW_LOGIN_EMAIL;
      const password = process.env.PREVIEW_LOGIN_PASSWORD;
      await runLoginSmoke({ baseUrl, email, password, accessCode });
      console.log(`OK preview login smoke: ${email} -> /app`);
    }
  } catch (error) {
    console.error(`Preview login smoke failed: ${error.message || error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
