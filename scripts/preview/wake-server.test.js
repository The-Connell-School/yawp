import { afterEach, describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createWakeHandler as createRawWakeHandler,
  hasMatchingPreviewAccessCredential,
  parsePreviewPr,
  startAccessLogFollower,
  wakeCommandTimeoutMs,
} from './wake-server.mjs';

const servers = [];
const roots = [];

function createWakeHandler(options) {
  return createRawWakeHandler({ authorizeWake: async () => true, ...options });
}

async function listen(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('preview wake server', () => {
  test('parses only exact positive-integer PR hosts for the configured domain', () => {
    expect(parsePreviewPr('pr-241.preview.yawp.school', 'preview.yawp.school')).toBe(241);
    expect(parsePreviewPr('PR-241.PREVIEW.YAWP.SCHOOL', 'preview.yawp.school')).toBe(241);
    expect(parsePreviewPr('pr-0.preview.yawp.school', 'preview.yawp.school')).toBeNull();
    expect(parsePreviewPr('pr-241.preview.yawp.school.evil.test', 'preview.yawp.school')).toBeNull();
    expect(parsePreviewPr('pr-241.evil.test', 'preview.yawp.school')).toBeNull();
    expect(parsePreviewPr('pr-241.preview.yawp.school:443', 'preview.yawp.school')).toBe(241);
  });

  test('keeps the parent wake timeout beyond lock, health, and rollback phases', () => {
    expect(wakeCommandTimeoutMs({})).toBe(1_080_000);
    expect(wakeCommandTimeoutMs({
      PREVIEW_LOCK_WAIT_SECONDS: '10',
      PREVIEW_WAKE_HEALTH_ATTEMPTS: '4',
      PREVIEW_WAKE_HEALTH_INTERVAL_SECONDS: '2',
    })).toBe(86_000);
  });

  test('authorizes a sleeping preview with a matching one-click code or signed access cookie', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preview-code-'));
    roots.push(root);
    const preview = path.join(root, 'previews', 'pr-241');
    mkdirSync(preview, { recursive: true });
    const secret = 'a'.repeat(64);
    writeFileSync(path.join(preview, 'access-seats.json'), JSON.stringify([
      { code: 'brisk-otter-4321', organizationId: 'local-dev-org', label: 'Master' },
    ]));
    writeFileSync(path.join(preview, 'access-secret'), `${secret}\n`);

    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app?code=brisk-otter-4321',
    })).toBe(true);
    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app?code=wrong-otter-4321',
    })).toBe(false);
    expect(await hasMatchingPreviewAccessCredential({ root, pr: 241, uri: '/app' })).toBe(false);

    const value = Buffer.from(JSON.stringify('seat-v1:local-dev-org')).toString('base64');
    const signature = createHmac('sha256', secret)
      .update(value)
      .digest('base64')
      .replace(/=+$/, '');
    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app',
      cookieHeader: `__yawp_preview_access=${encodeURIComponent(`${value}.${signature}`)}`,
    })).toBe(true);
  });

  test('requires access authorization before waking a sleeping preview', async () => {
    const options = [];
    const url = await listen(createWakeHandler({
      domain: 'preview.yawp.school',
      secret: 'wake-secret',
      authorizeWake: async (_pr, uri) => uri.includes('code=brisk-otter-4321'),
      ensureRunning: async (_pr, wakeOptions) => options.push(wakeOptions),
      recordAccess: async () => {},
    }));
    const request = (uri) => fetch(`${url}${uri}`, {
      redirect: 'manual',
      headers: {
        'x-preview-wake-secret': 'wake-secret',
        'x-forwarded-host': 'pr-241.preview.yawp.school',
        'x-forwarded-uri': uri,
      },
    });

    expect((await request('/app')).status).toBe(401);
    expect((await request('/app?code=brisk-otter-4321')).status).toBe(307);
    expect(options).toEqual([{ allowDisplacement: true }]);
  });

  test('rejects requests that do not carry the bootstrap secret', async () => {
    const wakes = [];
    const url = await listen(createWakeHandler({
      domain: 'preview.yawp.school',
      secret: 'correct-secret',
      ensureRunning: async (pr) => wakes.push(pr),
      recordAccess: async () => {},
    }));

    const response = await fetch(`${url}/`, {
      headers: {
        'x-preview-wake-secret': 'wrong-secret',
        'x-forwarded-host': 'pr-241.preview.yawp.school',
      },
    });

    expect(response.status).toBe(403);
    expect(wakes).toEqual([]);
  });

  test('does not run a wake command for malformed or unrelated hosts', async () => {
    const wakes = [];
    const url = await listen(createWakeHandler({
      domain: 'preview.yawp.school',
      secret: 'wake-secret',
      ensureRunning: async (pr) => wakes.push(pr),
      recordAccess: async () => {},
    }));

    const malformed = await fetch(`${url}/auth`, {
      headers: {
        'x-preview-wake-secret': 'wake-secret',
        'x-forwarded-host': 'pr-241.preview.yawp.school.evil.test',
      },
    });
    const unrelated = await fetch(`${url}/auth`, {
      headers: {
        'x-preview-wake-secret': 'wake-secret',
        'x-forwarded-host': 'demo.yawp.school',
      },
    });

    expect(malformed.status).toBe(204);
    expect(unrelated.status).toBe(204);
    expect(wakes).toEqual([]);
  });

  test('coalesces concurrent first requests into one wake operation', async () => {
    let calls = 0;
    let release;
    const waiting = new Promise((resolve) => { release = resolve; });
    const url = await listen(createWakeHandler({
      domain: 'preview.yawp.school',
      secret: 'wake-secret',
      ensureRunning: async () => {
        calls += 1;
        await waiting;
        return { result: 'woken' };
      },
      recordAccess: async () => {},
    }));
    const options = {
      headers: {
        'x-preview-wake-secret': 'wake-secret',
        'x-forwarded-host': 'pr-241.preview.yawp.school',
      },
    };

    const first = fetch(`${url}/`, { ...options, redirect: 'manual' });
    const second = fetch(`${url}/`, { ...options, redirect: 'manual' });
    await Bun.sleep(20);
    release();

    expect((await first).status).toBe(307);
    expect((await second).status).toBe(307);
    expect(calls).toBe(1);
  });

  test('bounds concurrent wakes across different preview projects', async () => {
    let release;
    const waiting = new Promise((resolve) => { release = resolve; });
    const url = await listen(createWakeHandler({
      domain: 'preview.yawp.school',
      secret: 'wake-secret',
      maxConcurrentWakes: 2,
      ensureRunning: async () => waiting,
      recordAccess: async () => {},
    }));
    const request = (pr) => fetch(`${url}/`, {
      redirect: 'manual',
      headers: {
        'x-preview-wake-secret': 'wake-secret',
        'x-forwarded-host': `pr-${pr}.preview.yawp.school`,
      },
    });

    const first = request(241);
    const second = request(242);
    await Bun.sleep(20);
    const third = await request(243);
    release();

    expect(third.status).toBe(503);
    expect((await first).status).toBe(307);
    expect((await second).status).toBe(307);
  });

  test('fallback router redirects to the same validated host after wake', async () => {
    const wakes = [];
    const url = await listen(createWakeHandler({
      domain: 'preview.yawp.school',
      secret: 'wake-secret',
      ensureRunning: async (pr) => {
        wakes.push(pr);
        return { result: 'woken' };
      },
      recordAccess: async () => {},
    }));

    const response = await fetch(`${url}/app/classes?course=3`, {
      redirect: 'manual',
      headers: {
        host: 'pr-241.preview.yawp.school',
        'x-preview-wake-secret': 'wake-secret',
        'x-forwarded-host': 'pr-241.preview.yawp.school',
        'x-forwarded-proto': 'https',
        'x-forwarded-uri': '/app/classes?course=3',
      },
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://pr-241.preview.yawp.school/app/classes?course=3',
    );
    expect(wakes).toEqual([241]);
  });

  test('uses a method-preserving redirect for a non-GET first request', async () => {
    const url = await listen(createWakeHandler({
      domain: 'preview.yawp.school',
      secret: 'wake-secret',
      ensureRunning: async () => ({ result: 'woken' }),
      recordAccess: async () => {},
    }));

    const response = await fetch(`${url}/api/documents/42`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Preserved' }),
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        'x-preview-wake-secret': 'wake-secret',
        'x-forwarded-host': 'pr-241.preview.yawp.school',
        'x-forwarded-uri': '/api/documents/42?draft=true',
      },
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://pr-241.preview.yawp.school/api/documents/42?draft=true',
    );
  });

  test('preserves method, body, path, and query through the wake redirect', async () => {
    let received;
    const upstream = await listen(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      received = {
        method: request.method,
        url: request.url,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      response.statusCode = 204;
      response.end();
    });
    const wake = await listen(createWakeHandler({
      domain: 'preview.yawp.school',
      secret: 'wake-secret',
      ensureRunning: async () => ({ result: 'woken' }),
      recordAccess: async () => {},
      redirectUrl: ({ uri }) => `${upstream}${uri}`,
    }));

    const response = await fetch(`${wake}/api/assignments?class=9`, {
      method: 'POST',
      body: JSON.stringify({ title: 'First request survives' }),
      headers: {
        'content-type': 'application/json',
        'x-preview-wake-secret': 'wake-secret',
        'x-forwarded-host': 'pr-241.preview.yawp.school',
      },
    });

    expect(response.status).toBe(204);
    expect(received).toEqual({
      method: 'POST',
      url: '/api/assignments?class=9',
      body: JSON.stringify({ title: 'First request survives' }),
    });
  });

  test('serves the wake redirect even when activity persistence fails', async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      const url = await listen(createWakeHandler({
        domain: 'preview.yawp.school',
        secret: 'wake-secret',
        ensureRunning: async () => ({ result: 'woken' }),
        authorizeWake: async () => true,
        recordAccess: async () => { throw new Error('disk unavailable'); },
      }));

      const response = await fetch(`${url}/`, {
        redirect: 'manual',
        headers: {
          'x-preview-wake-secret': 'wake-secret',
          'x-forwarded-host': 'pr-241.preview.yawp.school',
        },
      });

      expect(response.status).toBe(307);
    } finally {
      console.error = originalError;
    }
  });

  test('returns a retryable unavailable response when the host cap cannot make room', async () => {
    const url = await listen(createWakeHandler({
      domain: 'preview.yawp.school',
      secret: 'wake-secret',
      ensureRunning: async () => {
        const error = new Error('all running previews are pinned');
        error.code = 'capacity-full';
        throw error;
      },
      recordAccess: async () => {},
    }));

    const response = await fetch(`${url}/`, {
      redirect: 'manual',
      headers: {
        'x-preview-wake-secret': 'wake-secret',
        'x-forwarded-host': 'pr-241.preview.yawp.school',
      },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(await response.text()).toContain('capacity');
  });

  test('records normal preview traffic asynchronously from Traefik access logs', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preview-access-log-'));
    roots.push(root);
    const accessLog = path.join(root, 'access.json');
    writeFileSync(accessLog, '');
    const accesses = [];
    const follower = startAccessLogFollower({
      accessLog,
      domain: 'preview.yawp.school',
      recordAccess: async (pr) => accesses.push(pr),
      pollMs: 10,
      maxBytes: 1,
    });
    await Bun.sleep(20);

    appendFileSync(accessLog, [
      JSON.stringify({ RequestHost: 'pr-241.preview.yawp.school', RequestMethod: 'GET', RequestPath: '/app', DownstreamStatus: 200 }),
      JSON.stringify({ RequestHost: 'pr-242.preview.yawp.school', RequestMethod: 'HEAD', RequestPath: '/', DownstreamStatus: 200 }),
      JSON.stringify({ RequestHost: 'pr-243.preview.yawp.school', RequestMethod: 'GET', RequestPath: '/api/healthcheck', DownstreamStatus: 200 }),
      JSON.stringify({ RequestHost: 'pr-244.preview.yawp.school', RequestMethod: 'GET', RequestPath: '/app', DownstreamStatus: 401 }),
      JSON.stringify({ RequestHost: 'demo.preview.yawp.school' }),
      '{malformed',
      '',
    ].join('\n'));
    await Bun.sleep(40);
    follower.stop();

    expect(accesses).toEqual([241]);
    expect(readFileSync(accessLog, 'utf8')).toBe('');
  });
});
