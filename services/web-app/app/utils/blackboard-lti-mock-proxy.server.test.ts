import { afterEach, describe, expect, test } from 'bun:test';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { proxyBlackboardLtiMock } from './blackboard-lti-mock-proxy.server';

const servers: Array<() => Promise<void>> = [];

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;
async function listenUpstream(handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as { port: number };
  servers.push(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      })
  );
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((close) => close()));
  delete process.env.BLACKBOARD_LTI_MOCK_URL;
  delete process.env.YAWP_ENVIRONMENT;
  process.env.NODE_ENV = 'test';
  delete process.env.PREVIEW_ACCESS_GATE;
});

describe('proxyBlackboardLtiMock', () => {
  test('returns 404 when the mock UI is disabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.YAWP_ENVIRONMENT = 'production';
    process.env.BLACKBOARD_LTI_MOCK_URL = 'http://127.0.0.1:9';
    const response = await proxyBlackboardLtiMock(
      new Request('http://localhost/dev/blackboard-lti-mock/')
    );
    expect(response.status).toBe(404);
  });

  test('forwards method, path, and body to the mock', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/yawp';
    let received: { url?: string; method?: string; body?: string } = {};
    const upstream = await listenUpstream(
      (incoming: IncomingMessage, response: ServerResponse) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => {
          received = {
            url: incoming.url,
            method: incoming.method,
            body: Buffer.concat(chunks).toString('utf8'),
          };
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: true }));
        });
      }
    );
    process.env.BLACKBOARD_LTI_MOCK_URL = upstream;

    const response = await proxyBlackboardLtiMock(
      new Request('http://localhost/dev/blackboard-lti-mock/dev/events', {
        method: 'POST',
        body: 'hello',
        headers: { 'content-type': 'text/plain' },
      }),
      'dev/events'
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(received.method).toBe('POST');
    expect(received.url).toBe('/dev/events');
    expect(received.body).toBe('hello');
  });

  test('forwards cookies and login redirects from the mock', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/yawp';
    const upstream = await listenUpstream(
      (incoming: IncomingMessage, response: ServerResponse) => {
        if (incoming.url?.startsWith('/learn/session')) {
          response.writeHead(302, {
            location: '/dev/blackboard-lti-mock/learn/courses',
            'set-cookie':
              'bb_learn=Learner; Path=/dev/blackboard-lti-mock; HttpOnly',
          });
          response.end();
          return;
        }
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<html>ok</html>');
      }
    );
    process.env.BLACKBOARD_LTI_MOCK_URL = upstream;

    const response = await proxyBlackboardLtiMock(
      new Request('http://localhost/dev/blackboard-lti-mock/learn/session', {
        method: 'POST',
        body: 'persona=student',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
      'learn/session'
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      '/dev/blackboard-lti-mock/learn/courses'
    );
    expect(response.headers.get('set-cookie')).toContain('bb_learn=Learner');
  });
});
