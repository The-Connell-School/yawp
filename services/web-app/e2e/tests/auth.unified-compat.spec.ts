import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const flag = 'feature_flag.unified-sign-on';
test.describe.configure({ mode: 'serial' });
test.afterEach(async () => {
  const db = createE2EPrismaClient();
  await db.setting.deleteMany({ where: { name: flag } });
  await db.$disconnect();
});

test('missing/malformed/off/targeted setting retains login, signup and class-link views', async ({
  page,
  request,
}) => {
  const db = createE2EPrismaClient();
  try {
    for (const value of [
      null,
      'broken-json',
      '{"mode":"off"}',
      '{"mode":"targeted","orgIds":["demo"]}',
    ]) {
      await db.setting.deleteMany({ where: { name: flag } });
      if (value)
        await db.setting.create({
          data: { name: flag, value, valueType: 'json' },
        });
      await page.goto(
        '/auth/login?redirectTo=%2Fapp%2Fmy-classes&screen=joined&fixture=success'
      );
      await expect(
        page.getByRole('heading', { name: 'Welcome back!' })
      ).toBeVisible();
      await expect(page.getByLabel('Email or handle')).toBeVisible();
      await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
      await expect(page.locator('[data-signon-screen]')).toHaveCount(0);
      const response = await request.post('/auth/login', {
        form: { intent: 'verify-code', code: '123456', screen: 'joined' },
      });
      expect(response.headers()['set-cookie']).toBeUndefined();
    }
    for (const width of [1280, 390]) {
      await page.setViewportSize({
        width,
        height: width === 1280 ? 1000 : 844,
      });
      for (const [route, name] of [
        ['/auth/login', 'login'],
        ['/auth/inv/signup', 'signup'],
        ['/join?t=invalid-local-token', 'class-link'],
      ] as const) {
        await page.goto(route);
        if (process.env.SIGNON_EVIDENCE_DIR) {
          fs.mkdirSync(process.env.SIGNON_EVIDENCE_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(
              process.env.SIGNON_EVIDENCE_DIR,
              `flag-off-${name}-${width}-impl.png`
            ),
            fullPage: true,
          });
        }
      }
    }
  } finally {
    await db.$disconnect();
  }
});

test('legacy password error, safe redirect, signed-in entry and forced password change', async ({
  page,
  e2eContext,
}) => {
  test.setTimeout(90_000);
  await page.goto('/auth/login?redirectTo=https%3A%2F%2Fevil.example');
  await page.getByLabel('Email or handle').fill(e2eContext.userEmail);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Invalid email or password')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('johndoe');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await page.goto('/auth/login');
  await expect(page).toHaveURL(/:\d+\/$/);
  await page.context().clearCookies();
  const db = createE2EPrismaClient();
  try {
    await db.user.update({
      where: { id: e2eContext.userId },
      data: { mustChangePassword: true },
    });
    await page.goto('/auth/login');
    await page.getByLabel('Email or handle').fill(e2eContext.userEmail);
    await page.getByLabel('Password', { exact: true }).fill('johndoe');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/required-password-change$/);
    await expect(
      page.getByRole('heading', { name: 'Choose a new password' })
    ).toBeVisible();
    await db.setting.upsert({
      where: { name: flag },
      create: { name: flag, value: 'true', valueType: 'json' },
      update: { value: 'true' },
    });
    await page.goto('/auth/required-password-change');
    await expect(page.locator('[data-signon-screen]')).toHaveAttribute(
      'data-signon-screen',
      'required-password'
    );
    await expect(
      page.getByRole('button', { name: 'Save password', exact: true })
    ).toBeVisible();
  } finally {
    await db.user.update({
      where: { id: e2eContext.userId },
      data: { mustChangePassword: false },
    });
    await db.$disconnect();
  }
});

test('enabled local resolver does not authenticate or accept fixture selectors', async ({
  page,
  request,
}) => {
  const db = createE2EPrismaClient();
  const sessionsBefore = await db.session.count();
  try {
    await db.setting.upsert({
      where: { name: flag },
      create: { name: flag, value: 'true', valueType: 'json' },
      update: { value: 'true' },
    });
    await page.goto(
      '/auth/login?screen=joined&state=membership&redirectTo=%2Fapp%2Fmy-classes'
    );
    await expect(
      page.getByRole('heading', { name: 'Sign in or create an account' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Continue with Google' })
    ).toBeDisabled();
    await page
      .getByLabel('Email, handle, or class code')
      .fill('new@example.com');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to Yawp!' })).toBeVisible();
    for (const intent of [
      'resolve',
      'verify-code',
      'google',
      'select-membership',
      'join-handle',
      'create-account',
    ]) {
      const response = await request.post('/auth/login', {
        form: { intent, fixture: 'joined', membershipId: 'made-up' },
      });
      expect(response.status()).toBe(intent === 'google' ? 503 : 400);
      expect(response.headers()['set-cookie']).toBeUndefined();
    }
    expect(
      (await page.context().cookies()).filter((cookie) => ['en_session', 'membership-id'].includes(cookie.name))
    ).toEqual([]);
    expect(await db.session.count()).toBe(sessionsBefore);
  } finally {
    await db.$disconnect();
  }
});
