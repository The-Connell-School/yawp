import { chromium } from '@playwright/test';
import { Client } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

// Real application and owned PostgreSQL database; only Internal's remote authority
// is simulated. This test never uses a production database or credential.
const database = new URL(process.env.DATABASE_URL!);
assert(['localhost', '127.0.0.1'].includes(database.hostname));
assert(database.pathname.startsWith('/yawp_'));
const port = Number(process.env.DEV_PORT);
const authorityPort = Number(process.env.INTERNAL_TEST_AUTHORITY_PORT);
assert(port > 1024 && authorityPort > 1024 && port !== authorityPort);
const origin = `http://localhost:${port}`;
const dir = mkdtempSync(join(tmpdir(), 'yawp-impersonation-'));
const db = new Client({ connectionString: database.toString() });
await db.connect();
const { rows: [user] } = await db.query(`SELECT u.id, u.email, m."organizationId", m.id AS "membershipId"
  FROM "User" u JOIN "OrgMembership" m ON m."userId"=u.id
  WHERE u.email='dev.teacher@yawp.local' AND m."isActive"=true LIMIT 1`);
assert(user, 'Run the local-dev fixture first');
const key = randomBytes(32).toString('base64url');
let token = randomBytes(32).toString('base64url');
let identity = { id: randomUUID(), actorId: 'browser-qa-operator', userId: user.id,
  organizationId: user.organizationId, expiresAt: new Date(Date.now() + 600000).toISOString() };
let redeemed = false, revoked = false, ends = 0;
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
  '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
  '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
const authority = Bun.serve({ hostname: '127.0.0.1', port: authorityPort,
  tls: { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) },
  async fetch(request) {
    if (request.headers.get('authorization') !== `Bearer ${key}`) return new Response(null, { status: 401 });
    const body = await request.json() as { token?: string; sessionId?: string };
    const action = new URL(request.url).pathname.split('/').pop();
    if (action === 'redeem' && body.token === token && !redeemed) { redeemed = true; return Response.json(identity); }
    if (action === 'context' && body.sessionId === identity.id && !revoked) return Response.json(identity);
    if (action === 'end' && body.sessionId === identity.id) { revoked = true; ends++; return new Response(null, { status: 204 }); }
    return new Response(null, { status: 403 });
  },
});
const log = openSync(join(dir, 'app.log'), 'w');
const app = spawn(process.execPath, ['run', 'dev', '--host', 'localhost', '--port', String(port), '--strictPort'], {
  cwd: process.cwd(), detached: true, stdio: ['ignore', log, log],
  env: { ...process.env, NODE_EXTRA_CA_CERTS: join(dir, 'cert.pem'),
    INTERNAL_IMPERSONATION_ENABLED: 'true', YAWP_PUBLIC_ORIGIN: origin,
    INTERNAL_PLATFORM_ORIGIN: `https://127.0.0.1:${authorityPort}`, YAWP_PRODUCTION_SERVICE_KEY: key,
    YAWP_MANAGEMENT_SERVICE_KEY: randomBytes(32).toString('base64url'), NODE_ENV: 'development' },
});
closeSync(log);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw new Error('Application exited before startup');
    try { ready = (await fetch(`${origin}/info`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await Bun.sleep(500);
  }
  assert(ready, 'Application must become ready');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const requested: string[] = [];
  page.on('request', request => requested.push(request.url()));
  await page.goto(`${origin}/auth/internal-impersonation#token=${token}`);
  await page.getByRole('region', { name: 'Active impersonation' }).waitFor({ timeout: 45000 });
  assert((await page.getByRole('region', { name: 'Active impersonation' }).innerText()).includes(user.email));
  assert(!page.url().includes(token));
  assert(!requested.some(url => url.includes(token)), 'Link token must never appear in a request URL');
  assert((await page.request.get(`${origin}/api/auth/check`)).ok());
  assert.equal((await page.request.post(`${origin}/api/membership-id`, { headers: { origin } })).status(), 403);
  const sessionId = identity.id;
  await page.getByRole('button', { name: 'Exit impersonation', exact: true }).click();
  await page.waitForURL(`${origin}/`);
  assert.equal(ends, 1);
  assert(!(await page.context().cookies()).some(cookie => cookie.name === 'yawp_internal_impersonation'));
  const { rows: events } = await db.query('SELECT action, "actorId", "userId" FROM "InternalImpersonationEvent" WHERE "sessionId"=$1', [sessionId]);
  assert(events.some(event => event.action === 'session.started'));
  assert(events.some(event => event.action.startsWith('request.completed.')));
  assert(events.some(event => event.action === 'session.ended'));
  assert(events.every(event => event.actorId === identity.actorId && event.userId === user.id));
  token = randomBytes(32).toString('base64url');
  identity = { ...identity, id: randomUUID() }; redeemed = false; revoked = false;
  await page.goto(`${origin}/auth/internal-impersonation#token=${token}`);
  await page.getByRole('region', { name: 'Active impersonation' }).waitFor();
  revoked = true;
  assert.equal((await page.request.get(`${origin}/api/auth/check`)).status(), 401);
  await page.reload();
  await page.getByRole('heading', { name: 'Impersonation is unavailable' }).waitFor();
  await page.getByRole('button', { name: 'Exit impersonation' }).click();
  await page.waitForURL(`${origin}/`);
  console.log('PASS: real browser handoff, banner, membership lock, audit, exit and revocation');
} catch (error) {
  // App logs stay private; do not echo request bodies or generated credentials.
  console.error('Browser impersonation acceptance failed:', error instanceof Error ? error.message.replaceAll(token, '[redacted]') : 'unknown failure');
  throw error;
} finally {
  await browser?.close();
  if (app.pid) try { process.kill(-app.pid, 'SIGTERM'); } catch {}
  authority.stop(true);
  await db.end();
  rmSync(dir, { recursive: true, force: true });
}
