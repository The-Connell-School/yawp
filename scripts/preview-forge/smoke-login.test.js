import { afterEach, describe, expect, test } from 'bun:test';
import http from 'node:http';
import { runLoginSmoke } from './smoke-login.mjs';

const servers = [];

function startServer(handler) {
  const server = http.createServer(handler);
  servers.push(server);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('runLoginSmoke', () => {
  test('passes when seeded preview credentials can reach /app with a session cookie', async () => {
    const seen = { loginBody: '', appCookie: '' };
    const server = await startServer((req, res) => {
      if (req.url === '/auth/login' && req.method === 'POST') {
        req.on('data', (chunk) => {
          seen.loginBody += chunk;
        });
        req.on('end', () => {
          res.writeHead(302, {
            location: '/app',
            'set-cookie': 'auth_session=preview-ok; Path=/; HttpOnly',
          });
          res.end();
        });
        return;
      }

      if (req.url === '/app' && req.method === 'GET') {
        seen.appCookie = req.headers.cookie || '';
        res.writeHead(seen.appCookie.includes('auth_session=preview-ok') ? 200 : 401);
        res.end('app');
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await expect(
      runLoginSmoke({
        baseUrl: server.url,
        email: 'teacher.e2e@yawp.test',
        password: 'teacher-e2e-password',
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(decodeURIComponent(seen.loginBody)).toContain(
      'email=teacher.e2e@yawp.test',
    );
    expect(decodeURIComponent(seen.loginBody)).toContain(
      'password=teacher-e2e-password',
    );
    expect(seen.appCookie).toContain('auth_session=preview-ok');
  });

  test('fails when login does not create an authenticated app session', async () => {
    const server = await startServer((req, res) => {
      if (req.url === '/auth/login' && req.method === 'POST') {
        res.writeHead(302, {
          location: '/app',
          'set-cookie': 'auth_session=wrong; Path=/; HttpOnly',
        });
        res.end();
        return;
      }

      if (req.url === '/app' && req.method === 'GET') {
        res.writeHead(401);
        res.end('not logged in');
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await expect(
      runLoginSmoke({
        baseUrl: server.url,
        email: 'teacher.e2e@yawp.test',
        password: 'teacher-e2e-password',
      }),
    ).rejects.toThrow('Expected /app to return HTTP 200 after login, got 401');
  });

  test('follows the dev-server /app redirect with the login cookie', async () => {
    const seen = { redirectedCookie: '' };
    const server = await startServer((req, res) => {
      if (req.url === '/auth/login' && req.method === 'POST') {
        res.writeHead(302, {
          location: '/app',
          'set-cookie': 'auth_session=preview-ok; Path=/; HttpOnly',
        });
        res.end();
        return;
      }

      if (req.url === '/app' && req.method === 'GET') {
        res.writeHead(308, { location: '/app/' });
        res.end();
        return;
      }

      if (req.url === '/app/' && req.method === 'GET') {
        seen.redirectedCookie = req.headers.cookie || '';
        res.writeHead(seen.redirectedCookie.includes('auth_session=preview-ok') ? 200 : 401);
        res.end('app');
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await expect(
      runLoginSmoke({
        baseUrl: server.url,
        email: 'teacher.e2e@yawp.test',
        password: 'teacher-e2e-password',
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(seen.redirectedCookie).toContain('auth_session=preview-ok');
  });
});
