import { afterEach, describe, expect, test } from 'bun:test';
import { createServer } from 'node:http';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWakeHandler, parsePreviewPr, startAccessLogFollower } from './wake-server.mjs';

const servers = [];
const roots = [];

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

  test('serves the wake redirect even when activity persistence fails', async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      const url = await listen(createWakeHandler({
        domain: 'preview.yawp.school',
        secret: 'wake-secret',
        ensureRunning: async () => ({ result: 'woken' }),
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
      JSON.stringify({ RequestHost: 'pr-241.preview.yawp.school' }),
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
