import { test, expect, type Page } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import fs from 'node:fs';
import path from 'node:path';

test.skip(
  process.env.SIGNON_LOCAL_TEST !== '1',
  'Disposable local database and captured mail required'
);
test.describe.configure({ mode: 'serial' });
const prefix = `signon-browser-${Date.now()}`;
const db = createE2EPrismaClient();
const flag = 'feature_flag.unified-sign-on';
const evidence = process.env.SIGNON_EVIDENCE_DIR;
const email = `${prefix}@example.test`;
const capture = process.env.SIGNON_MAIL_CAPTURE_DIR!;
async function shot(page: Page, name: string, width: number) {
  if (evidence) {
    fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({
      path: path.join(evidence, `${name}-${width}-impl.png`),
      fullPage: true,
    });
  }
}
async function codeFor(target: string) {
  const files = fs
    .readdirSync(capture)
    .map((file) => ({
      file,
      time: fs.statSync(path.join(capture, file)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);
  for (const { file } of files) {
    const content = JSON.parse(
      fs.readFileSync(path.join(capture, file), 'utf8')
    );
    if (content.email === target) return content.code;
  }
  throw new Error('No captured code');
}
test.beforeAll(async () => {
  if (
    !['localhost', '127.0.0.1'].includes(
      new URL(process.env.E2E_DATABASE_URL!).hostname
    )
  )
    throw new Error('Local database required');
  await db.organization.create({
    data: { id: prefix, name: 'Lincoln High', plan: 'SCHOOL' },
  });
  await db.school.create({
    data: {
      id: prefix,
      code: prefix,
      name: 'Lincoln High',
      organizationId: prefix,
    },
  });
  await db.class.create({
    data: {
      id: prefix,
      code: prefix,
      title: 'English 11, Period 2',
      schoolId: prefix,
    },
  });
});
test.afterAll(async () => {
  await db.setting.deleteMany({ where: { name: flag } });
  const users = await db.user.findMany({
    where: { email: { in: ['maya1280@yawp.local', 'maya390@yawp.local'] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.password.deleteMany({ where: { userId: { in: ids } } });
  await db.orgMembership.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.class.delete({ where: { id: prefix } });
  await db.school.delete({ where: { id: prefix } });
  await db.organization.delete({ where: { id: prefix } });
  await db.$disconnect();
});
for (const width of [1280, 390])
  test(`real handlers: class, email code errors/retry, verified signup and reset at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await db.setting.upsert({
      where: { name: flag },
      update: { value: 'true' },
      create: { name: flag, value: 'true', valueType: 'boolean' },
    });
    const address = `maya${width}@yawp.local`;
    await page.goto('/auth/login?redirectTo=%2Fapp%2Fmy-classes');
    await expect(
      page.getByRole('button', { name: 'Continue with Google' })
    ).toBeDisabled();
    await shot(page, 'signon-03-google-unavailable', width);
    await page.getByLabel('Email, handle, or class code').fill(address);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Welcome to YAWP!' })
    ).toBeVisible();
    await page
      .getByRole('button', { name: "I'm a student I have a class code" })
      .click();
    await page.getByLabel('Class code').fill(prefix);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Finish setting up your account' })
    ).toBeVisible();
    await shot(page, 'signon-23-resolved-class', width);
    await page
      .getByRole('button', { name: 'Email me a code', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Check your email' })
    ).toBeVisible();
    await shot(page, 'signon-13-email-code', width);
    await page.getByLabel('Code', { exact: true }).fill('000000');
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('code');
    await shot(page, 'signon-14-code-error', width);
    await page.getByRole('button', { name: 'Resend code' }).click();
    await expect(page.getByRole('alert')).toContainText('Too many attempts');
    await shot(page, 'signon-14-code-retry', width);
    // Retry delay is server enforced; expire the cooldown only in this local fixture.
    const flowRow = await db.signonFlow.findFirstOrThrow({
      where: { data: { path: ['identifier'], equals: address } },
      orderBy: { expiresAt: 'desc' },
    });
    const flow = flowRow.data as any;
    flow.otp.sent = 0;
    flow.otp.expires = 0;
    await db.signonFlow.update({
      where: { id: flowRow.id },
      data: { data: flow },
    });
    await page.reload(); // A fresh loader resumes only with the explicit continuation.
    await page.goto('/auth/login?continue=1');
    await page.getByLabel('Code', { exact: true }).fill(await codeFor(address));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'That code has expired. Send yourself a new one.'
    );
    await shot(page, 'signon-14-code-expired', width);
    await page
      .getByRole('button', { name: 'Send a new code', exact: true })
      .click();
    await expect(page.getByRole('status')).toHaveText(
      'New code sent. Check spam too.'
    );
    await shot(page, 'signon-14-code-resent', width);
    await page.getByLabel('Code', { exact: true }).fill(await codeFor(address));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Create your account' })
    ).toBeVisible();
    await shot(page, 'signon-15-verified-signup', width);
    await page.getByLabel('Your name').fill('Maya Reynolds');
    await page.getByLabel('Password', { exact: true }).fill('local-password');
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill('local-password');
    await page
      .getByRole('button', { name: 'Create Account', exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/my-classes$/);
    const user = await db.user.findUniqueOrThrow({
      where: { email: address },
      include: { memberships: true },
    });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.memberships[0].role).toBe('STUDENT');
    await page.context().clearCookies();
    await page.goto('/auth/login?redirectTo=%2Fapp%2Fmy-classes');
    await page.getByLabel('Email, handle, or class code').fill(address);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Enter your password' })
    ).toBeVisible();
    await shot(page, 'signon-05-resolved-password', width);
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(
      page.getByRole('heading', { name: 'Reset your password', exact: true })
    ).toBeVisible();
    await shot(page, 'signon-13-reset-code', width);
    await page.getByLabel('Code', { exact: true }).fill(await codeFor(address));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Set a new password' })
    ).toBeVisible();
    await page
      .getByLabel('New password', { exact: true })
      .fill('new-local-password');
    await page
      .getByLabel('Confirm new password', { exact: true })
      .fill('new-local-password');
    await page
      .getByRole('button', { name: 'Save password', exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/my-classes$/);
  });
test('flag off retains live legacy login, signup, class links, and direct callback gates', async ({
  page,
  request,
}) => {
  for (const value of [
    null,
    'broken',
    'false',
    '{"mode":"targeted","orgIds":["demo"]}',
  ]) {
    await db.setting.deleteMany({ where: { name: flag } });
    if (value)
      await db.setting.create({
        data: { name: flag, value, valueType: 'json' },
      });
    await page.goto('/auth/login');
    await expect(
      page.getByRole('heading', { name: 'Welcome back!' })
    ).toBeVisible();
    const result = await request.get(
      '/auth/unified/google/callback?code=forged&state=forged'
    );
    expect(result.status()).toBe(404);
  }
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    for (const [route, name] of [
      ['/auth/login', 'login'],
      ['/auth/inv/signup', 'signup'],
      ['/join?t=invalid', 'class-link'],
    ]) {
      await page.goto(route);
      await shot(page, `flag-off-${name}`, width);
    }
  }
});
