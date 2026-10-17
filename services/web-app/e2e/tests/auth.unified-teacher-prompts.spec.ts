import { test, expect, type Page } from '@playwright/test';
import { createCookieSessionStorage } from 'react-router';
import { createE2EPrismaClient } from '../prisma-client';
import fs from 'node:fs';
import path from 'node:path';

// This suite owns its fixtures and restores every Setting it changes.
test.skip(process.env.SIGNON_LOCAL_TEST !== '1', 'Disposable local test database only');
test.describe.configure({ mode: 'serial' });
const db = createE2EPrismaClient();
const prefix = `teacher-prompts-${Date.now()}`;
const flags = ['unified-sign-on', 'signon-teacher-prompts', 'free_tier'];
const savedFlags: { name: string; value: string }[] = [];
const email = `${prefix}@example.test`;
const handle = `${prefix}-handle`;
const copy = "You're not in any active classes. Join one with a class code, or ask your teacher to add you back.";
const explanation = 'Teacher accounts need a school email. Sign out and start a free classroom with your school email.';

async function flag(key: string, enabled: boolean) {
  const name = `feature_flag.${key}`;
  await db.setting.upsert({ where: { name }, create: { name, value: String(enabled), valueType: 'boolean' }, update: { value: String(enabled) } });
}

test.beforeAll(async () => {
  if (!['localhost', '127.0.0.1'].includes(new URL(process.env.E2E_DATABASE_URL!).hostname)) throw Error('Local disposable DB required');
  savedFlags.push(...await db.setting.findMany({ where: { name: { in: flags.map(key => `feature_flag.${key}`) } }, select: { name: true, value: true } }));
  for (const key of flags) await flag(key, true);
  await db.organization.create({ data: { id: prefix, name: 'Prompt fixture', plan: 'SCHOOL' } });
  for (const kind of ['email', 'handle', 'neutral', 'staff']) {
    await db.user.create({ data: {
      id: `${prefix}-${kind}`, name: 'Maya',
      email: kind === 'handle' ? null : kind === 'email' ? email : `${prefix}-${kind}@example.test`,
      username: kind === 'handle' ? handle : null,
      ...(kind === 'neutral' ? {} : { memberships: { create: { id: `${prefix}-${kind}`, organizationId: prefix, role: kind === 'staff' ? 'TEACHER' : 'STUDENT', isActive: false } } }),
    } });
  }
});

test.afterAll(async () => {
  await db.signonFlow.deleteMany({ where: { data: { path: ['userId'], string_starts_with: prefix } } });
  await db.session.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.orgMembership.deleteMany({ where: { organizationId: prefix } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.organization.deleteMany({ where: { id: prefix } });
  for (const key of flags) {
    const name = `feature_flag.${key}`;
    const saved = savedFlags.find(row => row.name === name);
    if (saved) await db.setting.update({ where: { name }, data: { value: saved.value } });
    else await db.setting.deleteMany({ where: { name } });
  }
  await db.$disconnect();
});

async function authenticate(page: Page, kind: string) {
  const session = await db.session.create({ data: { userId: `${prefix}-${kind}`, expirationDate: new Date(Date.now() + 3600000) } });
  const storage = createCookieSessionStorage({ cookie: { name: 'en_session', secrets: process.env.SESSION_SECRET!.split(','), path: '/', httpOnly: true, sameSite: 'lax' } });
  const cookie = await storage.getSession();
  cookie.set('sessionId', session.id);
  const value = (await storage.commitSession(cookie)).split(';')[0].slice('en_session='.length);
  await page.context().addCookies([{ name: 'en_session', value: decodeURIComponent(value), url: test.info().project.use.baseURL! }]);
  return session.id;
}

async function shot(page: Page, name: string, width: number) {
  const dir = process.env.SIGNON_EVIDENCE_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `built-${name}-${width === 1280 ? 'desktop' : 'mobile'}.png`), fullPage: true });
}

for (const width of [1280, 390]) {
  test(`inactive email student and signed-in class code at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await authenticate(page, 'email');
    await page.goto('/no-membership');
    await expect(page.getByRole('heading', { name: "Your account isn't active" })).toBeVisible();
    await expect(page.getByText(copy, { exact: true })).toBeVisible();
    await expect(page.locator('.signon-identity')).toContainText(email);
    await expect(page.getByRole('link', { name: 'Start a free classroom', exact: true })).toHaveAttribute('href', '/free');
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await shot(page, 'inactive', width);
    await page.getByRole('button', { name: 'Enter a class code', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Enter your class code' })).toBeVisible();
    await expect(page.getByLabel('Class code', { exact: true })).toBeVisible();
    await expect(page.getByText('Your teacher has it.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join class', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Teachers can start a free classroom', exact: true })).toHaveAttribute('href', '/free');
    await shot(page, 'classcode', width);
    await page.getByLabel('Class code', { exact: true }).fill('UNKNOWN-LOCAL-CODE');
    await page.getByRole('button', { name: 'Join class', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    expect(await db.session.count({ where: { userId: `${prefix}-email` } })).toBe(0);
  });

  for (const screen of ['inactive', 'classcode']) {
    test(`handle-only ${screen} signs out before free entry at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
      const sessionId = await authenticate(page, 'handle');
      await page.goto(screen === 'inactive' ? '/no-membership' : '/enter-code');
      await expect(page.locator('.signon-identity')).toContainText(`@${handle}`);
      await expect(page.getByText(explanation, { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: /free classroom/ })).toHaveCount(0);
      if (screen === 'inactive') {
        await expect(page.getByRole('button', { name: 'Enter a class code' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
      }
      const button = page.getByRole('button', { name: 'Sign out and continue', exact: true });
      await expect(button.locator('xpath=ancestor::form')).toHaveAttribute('method', 'post');
      await expect(button.locator('xpath=ancestor::form')).toHaveAttribute('action', '/auth/logout?redirectTo=%2Ffree');
      await shot(page, `handleonly-${screen}`, width);
      const post = page.waitForRequest(r => new URL(r.url()).pathname === '/auth/logout' && r.method() === 'POST');
      await button.click();
      await post;
      await expect(page).toHaveURL(/\/free$/);
      await expect.poll(() => db.session.count({ where: { id: sessionId } })).toBe(0);
      const access = await page.request.get('/app', { maxRedirects: 0 });
      expect(access.status()).toBe(302);
      expect(access.headers().location).toMatch(/auth\/login/);
    });
  }

  test(`no roles uses neutral inactive copy at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await authenticate(page, 'neutral');
    await page.goto('/no-membership');
    await expect(page.getByText(copy, { exact: true })).toBeVisible();
    await expect(page.getByText('Ask your school admin to turn it back on.')).toHaveCount(0);
  });
}

test('flag off preserves the legacy no-membership DOM', async ({ page }) => {
  await flag('signon-teacher-prompts', false);
  try {
    await authenticate(page, 'neutral');
    await page.goto('/no-membership');
    await expect(page.locator('h1')).toHaveText('No Membership');
    await expect(page.getByText("You don't have an organization membership yet. Please contact your administrator.")).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retry', exact: true })).toHaveAttribute('href', '/app');
    await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
    await expect(page.locator('.unified-signon')).toHaveCount(0);
    await expect(page.getByText(/free classroom/)).toHaveCount(0);
  } finally { await flag('signon-teacher-prompts', true); }
});
