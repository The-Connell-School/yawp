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

function getBasicAuthHeader(basicAuth) {
  if (!basicAuth) return {};
  if (!basicAuth.username || !basicAuth.password) {
    throw new Error('basic auth username and password are required');
  }
  return {
    authorization: `Basic ${Buffer.from(
      `${basicAuth.username}:${basicAuth.password}`,
    ).toString('base64')}`,
  };
}

async function getWithRedirects(
  url,
  { cookie, basicAuth, maxRedirects = 3, requestFn = request } = {},
) {
  let currentUrl = url;
  const allowedOrigin = new URL(url).origin;
  for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
    const response = await requestFn(currentUrl, {
      headers: {
        ...getBasicAuthHeader(basicAuth),
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

export async function runLoginSmoke({
  baseUrl,
  email,
  password,
  basicAuth,
  requestFn = request,
} = {}) {
  if (!baseUrl) throw new Error('baseUrl is required');
  if (!email || !password) throw new Error('email and password are required');

  const form = new URLSearchParams({
    email,
    password,
    redirectTo: '/app',
  }).toString();

  const login = await requestFn(appendPath(baseUrl, '/auth/login'), {
    method: 'POST',
    body: form,
    headers: {
      ...getBasicAuthHeader(basicAuth),
      'content-type': 'application/x-www-form-urlencoded',
    },
  });

  if (login.status < 300 || login.status >= 400) {
    throw new Error(`Expected login redirect, got HTTP ${login.status}`);
  }

  const cookies = getCookies(login.headers);
  if (!cookies) {
    throw new Error('Expected login to set an auth cookie');
  }

  const app = await getWithRedirects(appendPath(baseUrl, '/app'), {
    basicAuth,
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
  basicAuth,
  requestFn = request,
} = {}) {
  if (!baseUrl) throw new Error('baseUrl is required');
  if (!email) throw new Error('email is required');

  const form = new URLSearchParams({
    email,
    redirectTo: '/app',
  }).toString();

  const login = await requestFn(appendPath(baseUrl, '/auth/dev-login'), {
    method: 'POST',
    body: form,
    headers: {
      ...getBasicAuthHeader(basicAuth),
      'content-type': 'application/x-www-form-urlencoded',
    },
  });

  if (login.status < 300 || login.status >= 400) {
    throw new Error(`Expected dev login redirect, got HTTP ${login.status}`);
  }

  const cookies = getCookies(login.headers);
  if (!cookies) {
    throw new Error('Expected dev login to set an auth cookie');
  }

  const app = await getWithRedirects(appendPath(baseUrl, '/app'), {
    basicAuth,
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
  const htpasswdCredential = process.env.PREVIEW_BASIC_AUTH || '';
  const usernameSeparator = htpasswdCredential.indexOf(':');
  const basicAuth = {
    username:
      usernameSeparator === -1
        ? ''
        : htpasswdCredential.slice(0, usernameSeparator),
    password: process.env.PREVIEW_BASIC_AUTH_PASSWORD || '',
  };

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
      await runDevLoginSmoke({ baseUrl, email, basicAuth });
      console.log(`OK preview dev login smoke: ${email} -> /app`);
    } else {
      const email = process.env.PREVIEW_LOGIN_EMAIL;
      const password = process.env.PREVIEW_LOGIN_PASSWORD;
      await runLoginSmoke({ baseUrl, email, password, basicAuth });
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
