import { afterEach, describe, expect, test } from 'bun:test';
import http from 'node:http';
import { runDevLoginSmoke, runLoginSmoke, shouldUseDevLogin } from './smoke-login.mjs';

const basicAuth = {
  username: 'preview-admin',
  password: 'shared-pass',
};
const basicAuthorization =
  'Basic cHJldmlldy1hZG1pbjpzaGFyZWQtcGFzcw==';

describe('runLoginSmoke', () => {
  test('requires explicit preview credentials', async () => {
    await expect(
      runLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
      }),
    ).rejects.toThrow('email and password are required');
  });

  test('passes basic auth and the app session cookie', async () => {
    const seen = { login: null, app: null };
    const requestFn = async (url, options = {}) => {
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
    };

    await expect(
      runLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
        email: 'teacher.e2e@yawp.test',
        password: 'teacher-e2e-password',
        basicAuth,
        requestFn,
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(seen.login.headers.authorization).toBe(basicAuthorization);
    expect(decodeURIComponent(seen.login.body)).toContain(
      'email=teacher.e2e@yawp.test',
    );
    expect(decodeURIComponent(seen.login.body)).toContain(
      'password=teacher-e2e-password',
    );
    expect(seen.app.headers.authorization).toBe(basicAuthorization);
    expect(seen.app.headers.cookie).toContain('auth_session=preview-ok');
  });

  test('fails when login does not create an authenticated app session', async () => {
    const requestFn = async (url, options = {}) => {
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
    };

    await expect(
      runLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
        email: 'teacher.e2e@yawp.test',
        password: 'teacher-e2e-password',
        basicAuth,
        requestFn,
      }),
    ).rejects.toThrow(
      'Expected /app to return HTTP 200 after login, got 401',
    );
  });

  test('follows the dev-server /app redirect with both auth layers', async () => {
    const seen = { redirectedHeaders: null };
    const requestFn = async (url, options = {}) => {
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
    };

    await expect(
      runLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
        email: 'teacher.e2e@yawp.test',
        password: 'teacher-e2e-password',
        basicAuth,
        requestFn,
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(seen.redirectedHeaders.authorization).toBe(basicAuthorization);
    expect(seen.redirectedHeaders.cookie).toContain(
      'auth_session=preview-ok',
    );
  });

  test('refuses to forward preview credentials across origins', async () => {
    const requestFn = async (url, options = {}) => {
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
    };

    await expect(
      runLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
        email: 'teacher.e2e@yawp.test',
        password: 'teacher-e2e-password',
        basicAuth,
        requestFn,
      }),
    ).rejects.toThrow(
      'Refusing cross-origin redirect during preview smoke',
    );
  });
});

describe('runDevLoginSmoke', () => {
  test('passes shared basic auth while checking a seeded dev persona', async () => {
    const seen = { login: null, app: null };
    const requestFn = async (url, options = {}) => {
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
    };

    await expect(
      runDevLoginSmoke({
        baseUrl: 'https://pr-142.preview.yawp.school',
        email: 'dev.teacher@yawp.local',
        basicAuth,
        requestFn,
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(seen.login.headers.authorization).toBe(basicAuthorization);
    expect(decodeURIComponent(seen.login.body)).toContain(
      'email=dev.teacher@yawp.local',
    );
    expect(seen.login.body).not.toContain('password=');
    expect(seen.app.headers.authorization).toBe(basicAuthorization);
    expect(seen.app.headers.cookie).toContain(
      'auth_session=preview-dev-ok',
    );
  });
});

describe('shouldUseDevLogin', () => {
  // The demo box was the first environment to combine seeded data with the production
  // runtime. Selecting on data mode alone sent it to /auth/dev-login, which the
  // production build gates off, so the deploy failed its own smoke test with HTTP 403
  // while the site itself was serving fine.
  test('seeded data on the production runtime uses password login', () => {
    expect(shouldUseDevLogin({ dataMode: 'seed', runtime: 'production' })).toBe(false);
  });

  test('seeded data on the dev-server runtime still uses dev login', () => {
    expect(shouldUseDevLogin({ dataMode: 'seed', runtime: 'fast' })).toBe(true);
  });

  test('production-dump data never uses dev login', () => {
    expect(shouldUseDevLogin({ dataMode: 'production-dump', runtime: 'fast' })).toBe(false);
    expect(shouldUseDevLogin({ dataMode: 'production-dump', runtime: 'production' })).toBe(false);
  });

  test('defaults match the PR preview case', () => {
    expect(shouldUseDevLogin({})).toBe(true);
  });
});
