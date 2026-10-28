import { afterEach, describe, expect, test } from 'bun:test';
import http from 'node:http';
import {
  enterPreviewAccess,
  isDemoEnvironment,
  isPreviewAccessGateEnabled,
  logPreviewLoginSmokeFailure,
  runDevLoginSmoke,
  runLoginSmoke,
  shouldUseDevLogin,
} from './smoke-login.mjs';

const accessCode = 'brave-otter-4193';

function isGet(options = {}) {
  return !options.method || options.method === 'GET';
}

function noGateAwareRequest(handler, { onRequest = () => {} } = {}) {
  return async (url, options = {}) => {
    expect(options.headers?.authorization).toBeUndefined();
    const pathname = new URL(url).pathname;
    onRequest(pathname);
    const hasAccess = options.headers?.cookie?.includes(
      '__yawp_preview_access='
    );
    if (pathname === '/' && isGet(options) && !hasAccess) {
      return { status: 200, headers: {}, body: 'home' };
    }
    if (pathname === '/api/healthcheck' && isGet(options)) {
      return { status: 200, headers: {}, body: 'ok' };
    }
    if (pathname === '/auth/dev-login' && isGet(options) && !hasAccess) {
      return { status: 400, headers: {}, body: 'no loader' };
    }
    if (
      pathname === '/auth/dev-login/options' &&
      isGet(options) &&
      !hasAccess
    ) {
      return { status: 401, headers: {}, body: 'access required' };
    }
    if (pathname === '/lti/launch' && options.method === 'POST' && !hasAccess) {
      return { status: 401, headers: {}, body: 'access required' };
    }
    if (pathname === '/auth/dev-login' && options.method === 'POST' && !hasAccess) {
      return { status: 401, headers: {}, body: 'access required' };
    }
    if (pathname === '/auth/preview-access' && options.method === 'POST') {
      expect(decodeURIComponent(options.body)).toContain(`code=${accessCode}`);
      return {
        status: 302,
        headers: {
          location: '/',
          'set-cookie':
            '__yawp_preview_access=signed; Path=/; HttpOnly; SameSite=Lax',
        },
        body: '',
      };
    }
    return handler(url, options);
  };
}

function gateAwareRequest(handler, { onRequest = () => {} } = {}) {
  return async (url, options = {}) => {
    expect(options.headers?.authorization).toBeUndefined();
    const pathname = new URL(url).pathname;
    onRequest(pathname);
    const hasAccess = options.headers?.cookie?.includes(
      '__yawp_preview_access='
    );
    if (pathname === '/' && !options.method && !hasAccess) {
      return {
        status: 302,
        headers: { location: '/auth/preview-access?returnTo=%2F' },
        body: '',
      };
    }
    if (
      pathname === '/auth/dev-login' &&
      options.method === 'POST' &&
      !hasAccess
    ) {
      return { status: 401, headers: {}, body: 'access required' };
    }
    if (pathname === '/auth/preview-access' && options.method === 'POST') {
      expect(decodeURIComponent(options.body)).toContain(`code=${accessCode}`);
      return {
        status: 302,
        headers: {
          location: '/',
          'set-cookie':
            '__yawp_preview_access=signed; Path=/; HttpOnly; SameSite=Lax',
        },
        body: '',
      };
    }
    return handler(url, options);
  };
}

describe('isPreviewAccessGateEnabled', () => {
  const saved = {};

  afterEach(() => {
    for (const key of ['PREVIEW_ACCESS_GATE', 'PREVIEW_SLUG', 'PR_NUMBER']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test('demo disables the site-wide gate while PR previews keep it', () => {
    for (const key of ['PREVIEW_ACCESS_GATE', 'PREVIEW_SLUG', 'PR_NUMBER']) {
      saved[key] = process.env[key];
    }
    process.env.PREVIEW_ACCESS_GATE = 'on';
    process.env.PREVIEW_SLUG = 'demo';
    delete process.env.PR_NUMBER;
    expect(isDemoEnvironment()).toBe(true);
    expect(isPreviewAccessGateEnabled()).toBe(false);

    process.env.PREVIEW_SLUG = 'pr-622';
    process.env.PR_NUMBER = '622';
    expect(isPreviewAccessGateEnabled()).toBe(true);
  });
});

describe('enterPreviewAccess', () => {
  test('without a site gate, proves public browsing and blocked dev tooling', async () => {
    const seenPaths = [];
    const requestFn = noGateAwareRequest(
      async (url) => {
        seenPaths.push(new URL(url).pathname);
        return { status: 404, headers: {}, body: '' };
      },
      {
        onRequest: (pathname) => seenPaths.push(pathname),
      }
    );

    await expect(
      enterPreviewAccess({
        baseUrl: 'https://demo.yawp.school',
        accessCode,
        gateEnabled: false,
        obtainAccessCookie: false,
        requestFn,
      })
    ).resolves.toBe('');

    expect(seenPaths).toEqual([
      '/',
      '/api/healthcheck',
      '/auth/dev-login',
      '/auth/dev-login',
      '/auth/dev-login/options',
      '/lti/launch',
    ]);
  });

  test('without a site gate, accepts blocked GET /auth/dev-login status codes', async () => {
    for (const status of [401, 403, 404, 405]) {
      const requestFn = async (url, options = {}) => {
        const pathname = new URL(url).pathname;
        if (pathname === '/' && isGet(options)) {
          return { status: 200, headers: {}, body: 'home' };
        }
        if (pathname === '/api/healthcheck' && isGet(options)) {
          return { status: 200, headers: {}, body: 'ok' };
        }
        if (pathname === '/auth/dev-login' && isGet(options)) {
          return { status, headers: {}, body: '' };
        }
        if (pathname === '/auth/dev-login' && options.method === 'POST') {
          return { status: 401, headers: {}, body: '' };
        }
        if (pathname === '/auth/dev-login/options' && isGet(options)) {
          return { status: 401, headers: {}, body: '' };
        }
        if (pathname === '/lti/launch' && options.method === 'POST') {
          return { status: 401, headers: {}, body: '' };
        }
        return { status: 404, headers: {}, body: '' };
      };

      await expect(
        enterPreviewAccess({
          baseUrl: 'https://demo.yawp.school',
          accessCode,
          gateEnabled: false,
          obtainAccessCookie: false,
          requestFn,
        })
      ).resolves.toBe('');
    }
  });

  test('accepts React Router 400 for anonymous GET /auth/dev-login without a site gate', async () => {
    const requestFn = async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/' && isGet(options)) {
        return { status: 200, headers: {}, body: 'home' };
      }
      if (pathname === '/api/healthcheck' && isGet(options)) {
        return { status: 200, headers: {}, body: 'ok' };
      }
      if (pathname === '/auth/dev-login' && isGet(options)) {
        return { status: 400, headers: {}, body: 'no loader' };
      }
      if (pathname === '/auth/dev-login' && options.method === 'POST') {
        return { status: 401, headers: {}, body: '' };
      }
      if (pathname === '/auth/dev-login/options' && isGet(options)) {
        return { status: 401, headers: {}, body: '' };
      }
      if (pathname === '/lti/launch' && options.method === 'POST') {
        return { status: 401, headers: {}, body: '' };
      }
      return { status: 404, headers: {}, body: '' };
    };

    await expect(
      enterPreviewAccess({
        baseUrl: 'https://demo.yawp.school',
        accessCode,
        gateEnabled: false,
        obtainAccessCookie: false,
        requestFn,
      })
    ).resolves.toBe('');
  });

  test('without a site gate, rejects a successful GET /auth/dev-login response', async () => {
    const requestFn = async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/' && isGet(options)) {
        return { status: 200, headers: {}, body: 'home' };
      }
      if (pathname === '/api/healthcheck' && isGet(options)) {
        return { status: 200, headers: {}, body: 'ok' };
      }
      if (pathname === '/auth/dev-login' && isGet(options)) {
        return { status: 302, headers: { location: '/app' }, body: '' };
      }
      if (pathname === '/auth/dev-login' && options.method === 'POST') {
        return { status: 401, headers: {}, body: '' };
      }
      if (pathname === '/auth/dev-login/options' && isGet(options)) {
        return { status: 401, headers: {}, body: '' };
      }
      if (pathname === '/lti/launch' && options.method === 'POST') {
        return { status: 401, headers: {}, body: '' };
      }
      return { status: 404, headers: {}, body: '' };
    };

    await expect(
      enterPreviewAccess({
        baseUrl: 'https://demo.yawp.school',
        accessCode,
        gateEnabled: false,
        obtainAccessCookie: false,
        requestFn,
      })
    ).rejects.toThrow(
      'Expected anonymous GET /auth/dev-login not to succeed, got HTTP 302'
    );
  });

  test('without a site gate, can still mint a preview access cookie for dev login', async () => {
    const requestFn = noGateAwareRequest(async () => ({
      status: 404,
      headers: {},
      body: '',
    }));

    await expect(
      enterPreviewAccess({
        baseUrl: 'https://demo.yawp.school',
        accessCode,
        gateEnabled: false,
        obtainAccessCookie: true,
        requestFn,
      })
    ).resolves.toContain('__yawp_preview_access=');
  });

  test('uses anonymous transport while proving the in-app gate', async () => {
    const seenPaths = [];
    const requestFn = gateAwareRequest(
      async (url) => {
        seenPaths.push(new URL(url).pathname);
        return { status: 404, headers: {}, body: '' };
      },
      {
        onRequest: (pathname) => seenPaths.push(pathname),
      }
    );

    await expect(
      enterPreviewAccess({
        baseUrl: 'https://pr-142.preview.yawp.school',
        accessCode,
        requestFn,
      })
    ).resolves.toContain('__yawp_preview_access=');

    expect(seenPaths).toEqual(['/', '/auth/dev-login', '/auth/preview-access']);
  });

  test('fails if POST /auth/dev-login reaches the app without a gate cookie', async () => {
    const requestFn = async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/') {
        return {
          status: 302,
          headers: { location: '/auth/preview-access?returnTo=%2F' },
          body: '',
        };
      }
      if (pathname === '/auth/dev-login' && options.method === 'POST') {
        return { status: 302, headers: { location: '/app' }, body: '' };
      }
      return { status: 404, headers: {}, body: '' };
    };

    await expect(
      enterPreviewAccess({
        baseUrl: 'https://pr-142.preview.yawp.school',
        accessCode,
        requestFn,
      })
    ).rejects.toThrow(
      'Expected anonymous POST /auth/dev-login to return HTTP 401, got 302'
    );
  });
});

describe('runLoginSmoke', () => {
  test('requires explicit preview credentials', async () => {
    await expect(
      runLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
      })
    ).rejects.toThrow('email and password are required');
  });

  test('on demo, password login does not require a preview access cookie', async () => {
    const previousSlug = process.env.PREVIEW_SLUG;
    process.env.PREVIEW_SLUG = 'demo';
    delete process.env.PR_NUMBER;

    const seen = { login: null, app: null };
    const requestFn = noGateAwareRequest(async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/auth/login' && options.method === 'POST') {
        seen.login = options;
        return {
          status: 302,
          headers: {
            location: '/app',
            'set-cookie': 'auth_session=preview-ok; Path=/; HttpOnly',
          },
          body: '',
        };
      }
      if (pathname === '/app') {
        seen.app = options;
        return { status: 200, headers: {}, body: 'app' };
      }
      return { status: 404, headers: {}, body: '' };
    });

    await expect(
      runLoginSmoke({
        baseUrl: 'https://demo.yawp.school',
        email: 'teacher.e2e@yawp.test',
        password: 'teacher-e2e-password',
        accessCode,
        requestFn,
      })
    ).resolves.toMatchObject({ ok: true });

    expect(seen.login.headers.cookie).toBeUndefined();
    expect(seen.app.headers.cookie).toContain('auth_session=preview-ok');

    if (previousSlug === undefined) delete process.env.PREVIEW_SLUG;
    else process.env.PREVIEW_SLUG = previousSlug;
  });

  test('passes preview access and app session cookies over anonymous transport', async () => {
    const seen = { login: null, app: null };
    const requestFn = gateAwareRequest(async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/auth/login' && options.method === 'POST') {
        seen.login = options;
        return {
          status: 302,
          headers: {
            location: '/app',
            'set-cookie': 'auth_session=preview-ok; Path=/; HttpOnly',
          },
          body: '',
        };
      }
      if (pathname === '/app') {
        seen.app = options;
        return { status: 200, headers: {}, body: 'app' };
      }
      return { status: 404, headers: {}, body: '' };
    });

    await expect(
      runLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
        email: 'teacher.e2e@yawp.test',
        password: 'teacher-e2e-password',
        accessCode,
        requestFn,
      })
    ).resolves.toMatchObject({ ok: true });

    expect(seen.login.headers.authorization).toBeUndefined();
    expect(seen.login.headers.cookie).toContain('__yawp_preview_access=');
    expect(decodeURIComponent(seen.login.body)).toContain(
      'email=teacher.e2e@yawp.test'
    );
    expect(decodeURIComponent(seen.login.body)).toContain(
      'password=teacher-e2e-password'
    );
    expect(seen.app.headers.authorization).toBeUndefined();
    expect(seen.app.headers.cookie).toContain('__yawp_preview_access=');
    expect(seen.app.headers.cookie).toContain('auth_session=preview-ok');
  });

  test('fails when login does not create an authenticated app session', async () => {
    const requestFn = gateAwareRequest(async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/auth/login' && options.method === 'POST') {
        return {
          status: 302,
          headers: {
            location: '/app',
            'set-cookie': 'auth_session=wrong; Path=/; HttpOnly',
          },
          body: '',
        };
      }
      return { status: 401, headers: {}, body: 'not logged in' };
    });

    await expect(
      runLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
        email: 'teacher.e2e@yawp.test',
        password: 'teacher-e2e-password',
        accessCode,
        requestFn,
      })
    ).rejects.toThrow('Expected /app to return HTTP 200 after login, got 401');
  });

  test('follows the dev-server /app redirect with app cookies', async () => {
    const seen = { redirectedHeaders: null };
    const requestFn = gateAwareRequest(async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/auth/login' && options.method === 'POST') {
        return {
          status: 302,
          headers: {
            location: '/app',
            'set-cookie': 'auth_session=preview-ok; Path=/; HttpOnly',
          },
          body: '',
        };
      }
      if (pathname === '/app') {
        return {
          status: 308,
          headers: { location: '/app/' },
          body: '',
        };
      }
      if (pathname === '/app/') {
        seen.redirectedHeaders = options.headers;
        return { status: 200, headers: {}, body: 'app' };
      }
      return { status: 404, headers: {}, body: '' };
    });

    await expect(
      runLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
        email: 'teacher.e2e@yawp.test',
        password: 'teacher-e2e-password',
        accessCode,
        requestFn,
      })
    ).resolves.toMatchObject({ ok: true });

    expect(seen.redirectedHeaders.authorization).toBeUndefined();
    expect(seen.redirectedHeaders.cookie).toContain('__yawp_preview_access=');
    expect(seen.redirectedHeaders.cookie).toContain('auth_session=preview-ok');
  });

  test('refuses to forward preview cookies across origins', async () => {
    const requestFn = gateAwareRequest(async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/auth/login' && options.method === 'POST') {
        return {
          status: 302,
          headers: {
            location: '/app',
            'set-cookie': 'auth_session=preview-ok; Path=/; HttpOnly',
          },
          body: '',
        };
      }
      if (pathname === '/app') {
        return {
          status: 302,
          headers: { location: 'https://attacker.example/collect' },
          body: '',
        };
      }
      throw new Error('request escaped the preview origin');
    });

    await expect(
      runLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
        email: 'teacher.e2e@yawp.test',
        password: 'teacher-e2e-password',
        accessCode,
        requestFn,
      })
    ).rejects.toThrow('Refusing cross-origin redirect during preview smoke');
  });
});

describe('runDevLoginSmoke', () => {
  test('uses anonymous transport for dev login and the app request', async () => {
    const seen = { login: null, app: null };
    const requestFn = gateAwareRequest(async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/auth/dev-login' && options.method === 'POST') {
        seen.login = options;
        return {
          status: 302,
          headers: {
            location: '/app',
            'set-cookie': 'auth_session=preview-dev-ok; Path=/; HttpOnly',
          },
          body: '',
        };
      }
      if (pathname === '/app') {
        seen.app = options;
        return { status: 200, headers: {}, body: 'app' };
      }
      return { status: 404, headers: {}, body: '' };
    });

    await expect(
      runDevLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
        email: 'dev.teacher@yawp.local',
        accessCode,
        requestFn,
      })
    ).resolves.toMatchObject({ ok: true });

    expect(seen.login.headers.authorization).toBeUndefined();
    expect(seen.login.headers.cookie).toContain('__yawp_preview_access=');
    expect(seen.app.headers.authorization).toBeUndefined();
    expect(seen.app.headers.cookie).toContain('auth_session=preview-dev-ok');
  });

  test('checks a seeded dev persona without a password', async () => {
    const seen = { login: null, app: null };
    const requestFn = gateAwareRequest(async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/auth/dev-login' && options.method === 'POST') {
        seen.login = options;
        return {
          status: 302,
          headers: {
            location: '/app',
            'set-cookie': 'auth_session=preview-dev-ok; Path=/; HttpOnly',
          },
          body: '',
        };
      }
      if (pathname === '/app') {
        seen.app = options;
        return { status: 200, headers: {}, body: 'app' };
      }
      return { status: 404, headers: {}, body: '' };
    });

    await expect(
      runDevLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
        email: 'dev.teacher@yawp.local',
        accessCode,
        requestFn,
      })
    ).resolves.toMatchObject({ ok: true });

    expect(seen.login.headers.cookie).toContain('__yawp_preview_access=');
    expect(seen.login.headers.authorization).toBeUndefined();
    expect(decodeURIComponent(seen.login.body)).toContain(
      'email=dev.teacher@yawp.local'
    );
    expect(seen.login.body).not.toContain('password=');
    expect(seen.app.headers.cookie).toContain('__yawp_preview_access=');
    expect(seen.app.headers.authorization).toBeUndefined();
    expect(seen.app.headers.cookie).toContain('auth_session=preview-dev-ok');
  });
});

describe('logPreviewLoginSmokeFailure', () => {
  test('redacts token-like substrings from deploy failure logs', () => {
    const lines = [];
    const original = console.error;
    console.error = (...args) => {
      lines.push(args);
    };
    try {
      logPreviewLoginSmokeFailure(
        new Error('login failed password=super-secret-token')
      );
    } finally {
      console.error = original;
    }

    const serialized = JSON.stringify(lines);
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).toContain('[redacted-token]');
    expect(lines[0]?.[0]).toBe('Preview login smoke failed:');
  });
});

describe('shouldUseDevLogin', () => {
  // The demo box was the first environment to combine seeded data with the production
  // runtime. Selecting on data mode alone sent it to /auth/dev-login, which the
  // production build gates off, so the deploy failed its own smoke test with HTTP 403
  // while the site itself was serving fine.
  test('seeded data on the production runtime uses password login', () => {
    expect(shouldUseDevLogin({ dataMode: 'seed', runtime: 'production' })).toBe(
      false
    );
  });

  test('seeded data on the dev-server runtime still uses dev login', () => {
    expect(shouldUseDevLogin({ dataMode: 'seed', runtime: 'fast' })).toBe(true);
  });

  test('production-dump data never uses dev login', () => {
    expect(
      shouldUseDevLogin({ dataMode: 'production-dump', runtime: 'fast' })
    ).toBe(false);
    expect(
      shouldUseDevLogin({ dataMode: 'production-dump', runtime: 'production' })
    ).toBe(false);
  });

  test('sanitized production data on the dev-server runtime uses dev login', () => {
    expect(
      shouldUseDevLogin({ dataMode: 'sanitized-production', runtime: 'fast' })
    ).toBe(true);
    expect(
      shouldUseDevLogin({
        dataMode: 'sanitized-production',
        runtime: 'production',
      })
    ).toBe(false);
  });

  test('defaults match the PR preview case', () => {
    expect(shouldUseDevLogin({})).toBe(true);
  });
});
