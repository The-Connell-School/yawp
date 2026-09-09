import { chromium, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { PrismaClient } from '../../../packages/prisma/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { InternalScenarios } from '../app/utils/internal-scenario.server';
import { generatePreviewAccessCode } from '../../../packages/prisma/preview-access-code';

const database = new URL(process.env.DATABASE_URL!);
assert(['localhost', '127.0.0.1'].includes(database.hostname) && database.pathname.startsWith('/yawp_'));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: database.toString(), ssl: false }) });
const port = Number(process.env.DEV_PORT);
assert(port > 1024);
const origin = `http://localhost:${port}`, code = generatePreviewAccessCode();
const org = await db.organization.create({ data: { name: 'Scenario browser QA', previewSeatCode: code } });
const targetId = randomUUID();
const service = new InternalScenarios(db, { targetId, environment: 'preview', organizationId: org.id });
const input = { jobId: randomUUID(), actorId: 'browser-scenario-operator', fingerprint: 'e'.repeat(64), mode: 'populate' as const,
  target: { id: targetId, environment: 'preview' as const },
  recipe: { teachers: 1, students: 2, classes: 1, assignmentsPerClass: 1, submissions: 'mixed' as const } };
const dir = mkdtempSync(join(tmpdir(), 'yawp-scenario-browser-'));
let app: ReturnType<typeof spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await service.apply(input);
  const teacher = await db.user.findFirstOrThrow({ where: { memberships: { some: { organizationId: org.id, role: 'TEACHER' } } } });
  const classroom = await db.class.findFirstOrThrow({ where: { school: { organizationId: org.id } } });
  const log = openSync(join(dir, 'app.log'), 'w', 0o600);
  app = spawn(process.execPath, ['run', 'dev', '--host', 'localhost', '--port', String(port), '--strictPort'], {
    cwd: process.cwd(), detached: true, stdio: ['ignore', log, log],
    env: { ...process.env, NODE_ENV: 'development', PREVIEW_ACCESS_GATE: 'on', PREVIEW_DATA_MODE: 'seed',
      PREVIEW_ACCESS_SECRET: randomBytes(32).toString('base64url'), PREVIEW_ACCESS_CODES: 'brave-otter-4193', PREVIEW_ACCESS_SEATS: '', PREVIEW_MASTER_ACCESS_CODE: '' },
  });
  closeSync(log);
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw new Error('Application exited before startup');
    try { ready = (await fetch(`${origin}/api/healthcheck`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await Bun.sleep(500);
  }
  assert(ready, 'Application must become ready');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(origin);
  await page.getByLabel('Access code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Open preview', exact: true }).click();
  await page.getByRole('link', { name: 'Log In', exact: true }).click();
  await page.getByRole('button', { name: /Open dev login menu/ }).click();
  await page.getByRole('button', { name: /Scenario Teacher 1/ }).click();
  await page.waitForURL(/\/app/);
  await page.goto(`${origin}/app/my-classes/${classroom.id}?tab=documents`);
  const table = page.getByRole('table', { name: /class documents/i });
  await expect(table).toBeVisible({ timeout: 45000 });
  await expect(table.getByText('In Progress', { exact: true }).first()).toBeVisible();
  await expect(table.getByText('Needs Grading', { exact: true }).first()).toBeVisible();
  assert.equal((await page.request.post(`${origin}/auth/dev-login`, { form: { email: 'dev.teacher@yawp.local' }, maxRedirects: 0 })).status(), 404);
  await service.apply({ ...input, jobId: randomUUID(), mode: 'reset' });
  const options = await page.request.get(`${origin}/auth/dev-login/options`);
  assert.equal(options.status(), 200);
  const menu = await options.json();
  assert.equal(menu.options.length, 3, 'Reset should list only the replacement scenario users');
  assert(!menu.options.some((option: { email: string }) => option.email === teacher.email), 'Retired teacher must disappear from the menu');
  assert.equal((await page.request.post(`${origin}/auth/dev-login`, { form: { email: teacher.email }, maxRedirects: 0 })).status(), 404);
  console.log('PASS: seat code, beaker teacher login, real draft/submission classroom UI, cross-seat rejection and retired-user exclusion');
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) console.error('Scenario page:', page.url(), (await page.locator('body').innerText()).slice(0, 900));
  throw error;
} finally {
  await browser?.close();
  if (app?.pid) {
    try { process.kill(-app.pid, 'SIGTERM'); } catch {}
    await Promise.race([new Promise(resolve => app!.once('close', resolve)), Bun.sleep(3000)]);
    if (app.exitCode === null) try { process.kill(-app.pid, 'SIGKILL'); } catch {}
  }
  await db.organization.update({ where: { id: org.id }, data: { previewSeatCode: null } });
  await db.orgMembership.updateMany({ where: { organizationId: org.id }, data: { isActive: false } });
  await db.class.updateMany({ where: { school: { organizationId: org.id } }, data: { isArchived: true } });
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
}
