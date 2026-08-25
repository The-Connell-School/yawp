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
  createDefaultWakeOperations,
  createPreviewSeatLookup,
  hasMatchingPreviewAccessCredential,
  parsePreviewHost,
  parsePreviewPr,
  previewServiceHostname,
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
    expect(parsePreviewPr('blackboard-pr-241.preview.yawp.school', 'preview.yawp.school')).toBe(241);
    expect(parsePreviewPr('blackboard.pr-241.preview.yawp.school', 'preview.yawp.school')).toBeNull();
  });

  test('distinguishes the Blackboard Learn host from the YAWP preview host', () => {
    expect(parsePreviewHost('pr-241.preview.yawp.school', 'preview.yawp.school')).toEqual({
      pr: 241,
      service: 'web',
    });
    expect(parsePreviewHost('blackboard-pr-291.preview.yawp.school', 'preview.yawp.school')).toEqual({
      pr: 291,
      service: 'blackboard',
    });
    expect(previewServiceHostname(291, 'preview.yawp.school', 'blackboard')).toBe(
      'blackboard-pr-291.preview.yawp.school'
    );
  });

  test('keeps the parent wake timeout beyond lock, health, and rollback phases', () => {
    expect(wakeCommandTimeoutMs({})).toBe(1_080_000);
    expect(wakeCommandTimeoutMs({
      PREVIEW_LOCK_WAIT_SECONDS: '10',
      PREVIEW_WAKE_HEALTH_ATTEMPTS: '4',
      PREVIEW_WAKE_HEALTH_INTERVAL_SECONDS: '2',
    })).toBe(86_000);
  });

  test('stamps the accepted authorization time onto the queued wake command', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preview-authorized-at-'));
    roots.push(root);
    const wakeScript = path.join(root, 'wake.sh');
    writeFileSync(
      wakeScript,
      '#!/usr/bin/env bash\nprintf "%s|%s|%s|%s\\n" "$PREVIEW_WAKE_AUTHORIZED_AT_EPOCH" "$PREVIEW_WAKE_AUTHORIZED_ORGANIZATION_ID" "$PREVIEW_WAKE_REQUIRE_PREVIEW_SEAT_CODE" "$PREVIEW_WAKE_AUTHORIZED_CODE_HMAC_SHA256"\n',
    );
    const operations = createDefaultWakeOperations({
      root,
      wakeScript,
      maxRunning: '4',
      commandTimeoutMs: 5000,
    });
    const before = Math.floor(Date.now() / 1000);

    const result = await operations.ensureRunning(241, {
      authorization: {
        organizationId: 'runtime-seat-2',
        requirePreviewSeatCode: true,
        credentialDigest: 'a'.repeat(64),
      },
    });

    const [acceptedAtText, organizationId, requirePreviewSeatCode, credentialDigest] = result.result.trim().split('|');
    const acceptedAt = Number(acceptedAtText);
    expect(acceptedAt).toBeGreaterThanOrEqual(before);
    expect(acceptedAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    expect(organizationId).toBe('runtime-seat-2');
    expect(requirePreviewSeatCode).toBe('true');
    expect(credentialDigest).toBe('a'.repeat(64));
  });

  test('looks up runtime and revoked seats in only the retained PR database', async () => {
    const calls = [];
    const lookup = createPreviewSeatLookup({
      execFileFn: async (command, args, options) => {
        calls.push({ command, args, options });
        return { stdout: args.at(-1).includes("'calm-panda-8127'") ? '1\n' : '0\n' };
      },
    });

    expect(await lookup({ pr: 241, code: 'calm-panda-8127' })).toBe(true);
    expect(await lookup({
      pr: 241,
      organizationId: 'revoked-seat',
      requirePreviewSeatCode: true,
    })).toBe(false);
    expect(await lookup({ pr: 241, code: "bad';drop-table" })).toBe(false);

    expect(calls).toHaveLength(2);
    expect(calls[0].command).toBe('docker');
    expect(calls[0].args).toContain('preview-postgres');
    expect(calls[0].args).toContain('yawp_pr_241');
    expect(calls[0].args.at(-1)).toContain('"previewSeatCode"');
    expect(calls[1].args.at(-1)).toContain('"previewSeatCode" IS NOT NULL');
    expect(calls[0].options.timeout).toBe(10_000);
  });

  test('authorizes master and runtime seats from the retained database while rejecting revoked manifest seats', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preview-code-'));
    roots.push(root);
    const preview = path.join(root, 'previews', 'pr-241');
    mkdirSync(preview, { recursive: true });
    const secret = 'a'.repeat(64);
    writeFileSync(path.join(preview, 'access-seats.json'), JSON.stringify([
      { code: 'brisk-otter-4321', organizationId: 'local-dev-org', label: 'Master' },
      { code: 'faded-fox-9876', organizationId: 'revoked-org', label: 'Revoked' },
    ]));
    writeFileSync(path.join(preview, 'access-secret'), `${secret}\n`);
    const lookups = [];
    const credentialIsCurrent = async (credential) => {
      lookups.push(credential);
      return credential.organizationId === 'local-dev-org'
        || credential.code === 'calm-panda-8127'
        || credential.organizationId === 'runtime-seat-2';
    };

    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app?code=brisk-otter-4321',
      credentialIsCurrent,
    })).toBe(true);
    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app?code=calm-panda-8127',
      credentialIsCurrent,
    })).toBe(true);
    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app?code=faded-fox-9876',
      credentialIsCurrent,
    })).toBe(false);

    const signedCookie = (seat, issuedAt) => {
      const value = Buffer.from(JSON.stringify(`seat-v2:${issuedAt}:${seat}`)).toString('base64');
      const signature = createHmac('sha256', secret)
        .update(value)
        .digest('base64')
        .replace(/=+$/, '');
      return `__yawp_preview_access=${encodeURIComponent(`${value}.${signature}`)}`;
    };
    const nowSeconds = 1_800_000_000;
    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app',
      cookieHeader: signedCookie('local-dev-org', nowSeconds - 60),
      nowSeconds,
      credentialIsCurrent,
    })).toBe(true);
    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app?code=faded-fox-9876',
      cookieHeader: signedCookie('local-dev-org', nowSeconds - 60),
      nowSeconds,
      credentialIsCurrent,
    })).toBe(true);
    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app',
      cookieHeader: signedCookie('runtime-seat-2', nowSeconds - 60),
      nowSeconds,
      credentialIsCurrent,
    })).toBe(true);
    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app',
      cookieHeader: signedCookie('revoked-org', nowSeconds - 60),
      nowSeconds,
      credentialIsCurrent,
    })).toBe(false);
    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app',
      cookieHeader: signedCookie('unknown-seat', nowSeconds - 60),
      nowSeconds,
      credentialIsCurrent,
    })).toBe(false);
    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app',
      cookieHeader: signedCookie('runtime-seat-2', nowSeconds - (31 * 24 * 60 * 60)),
      nowSeconds,
      credentialIsCurrent,
    })).toBe(false);
    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app?code=malformed',
      nowSeconds,
      credentialIsCurrent,
    })).toBe(false);
    expect(await hasMatchingPreviewAccessCredential({
      root,
      pr: 241,
      uri: '/app',
      nowSeconds,
      credentialIsCurrent,
    })).toBe(false);
    expect(lookups).toContainEqual({
      pr: 241,
      organizationId: 'runtime-seat-2',
      requirePreviewSeatCode: true,
    });
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

  test('returns retryable service unavailable while the requested preview is deploying', async () => {
    const error = new Error('Preview pr-241 deployment is in progress');
    error.code = 'deploying';
    const url = await listen(createWakeHandler({
      domain: 'preview.yawp.school',
      secret: 'wake-secret',
      ensureRunning: async () => { throw error; },
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
    expect(await response.text()).toContain('deployment is in progress');
  });

  test('returns retryable service unavailable when authorization expires in the lock queue', async () => {
    const error = new Error('Preview authorization expired while queued');
    error.code = 'authorization-stale';
    const url = await listen(createWakeHandler({
      domain: 'preview.yawp.school',
      secret: 'wake-secret',
      ensureRunning: async () => { throw error; },
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
    expect(await response.text()).toContain('authorization expired');
  });

  test('classifies the in-flight deployment shell refusal for retry handling', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preview-deploying-'));
    roots.push(root);
    const wakeScript = path.join(root, 'wake.sh');
    writeFileSync(
      wakeScript,
      '#!/usr/bin/env bash\necho "Preview pr-241 deployment is in progress" >&2\nexit 11\n',
    );
    const operations = createDefaultWakeOperations({
      root,
      wakeScript,
      maxRunning: '4',
      commandTimeoutMs: 5000,
    });

    await expect(operations.ensureRunning(241)).rejects.toMatchObject({ code: 'deploying' });
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

  test('records only application-authorized traffic from Traefik access logs', async () => {
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
    });
    await Bun.sleep(20);

    appendFileSync(accessLog, [
      JSON.stringify({ RequestHost: 'pr-241.preview.yawp.school', RequestMethod: 'GET', DownstreamStatus: 200, 'origin_X-Yawp-Preview-Authorized': '1' }),
      JSON.stringify({ RequestHost: 'pr-242.preview.yawp.school', RequestMethod: 'GET', DownstreamStatus: 302 }),
      JSON.stringify({ RequestHost: 'pr-243.preview.yawp.school', RequestMethod: 'GET', DownstreamStatus: 200 }),
      JSON.stringify({ RequestHost: 'pr-244.preview.yawp.school', RequestMethod: 'GET', DownstreamStatus: 401 }),
      JSON.stringify({ RequestHost: 'pr-245.preview.yawp.school', RequestMethod: 'GET', DownstreamStatus: 200 }),
      JSON.stringify({ RequestHost: 'pr-246.preview.yawp.school', RequestMethod: 'HEAD', DownstreamStatus: 200, 'downstream_X-Yawp-Preview-Authorized': '1' }),
      JSON.stringify({ RequestHost: 'pr-247.preview.yawp.school', RequestMethod: 'OPTIONS', DownstreamStatus: 200, 'downstream_X-Yawp-Preview-Authorized': '1' }),
      JSON.stringify({ RequestHost: 'pr-248.preview.yawp.school', RequestMethod: 'GET', DownstreamStatus: 302, 'downstream_X-Yawp-Preview-Authorized': '1' }),
      JSON.stringify({ RequestHost: 'demo.preview.yawp.school' }),
      '{malformed',
      '',
    ].join('\n'));
    await Bun.sleep(40);
    follower.stop();

    expect(accesses.sort()).toEqual([241, 248]);
    expect(readFileSync(accessLog, 'utf8')).toContain('pr-241.preview.yawp.school');
  });

  test('does not truncate an access record appended while activity persistence is pending', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preview-access-log-race-'));
    roots.push(root);
    const accessLog = path.join(root, 'access.json');
    writeFileSync(accessLog, '');
    const accesses = [];
    let releaseFirst;
    let sawFirst;
    const firstSeen = new Promise((resolve) => { sawFirst = resolve; });
    const firstRelease = new Promise((resolve) => { releaseFirst = resolve; });
    const follower = startAccessLogFollower({
      accessLog,
      domain: 'preview.yawp.school',
      recordAccess: async (pr) => {
        accesses.push(pr);
        if (pr === 241) {
          sawFirst();
          await firstRelease;
        }
      },
      pollMs: 10,
    });
    await Bun.sleep(20);
    appendFileSync(accessLog, `${JSON.stringify({
      RequestHost: 'pr-241.preview.yawp.school',
      RequestMethod: 'GET',
      DownstreamStatus: 200,
      'origin_X-Yawp-Preview-Authorized': '1',
    })}\n`);
    await firstSeen;
    appendFileSync(accessLog, `${JSON.stringify({
      RequestHost: 'pr-242.preview.yawp.school',
      RequestMethod: 'GET',
      DownstreamStatus: 200,
      'origin_X-Yawp-Preview-Authorized': '1',
    })}\n`);
    releaseFirst();
    await Bun.sleep(50);
    follower.stop();

    expect(accesses).toEqual([241, 242]);
  });
});
