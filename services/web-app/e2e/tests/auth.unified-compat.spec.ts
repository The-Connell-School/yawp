import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { submitUnifiedLogin } from '../helpers/unified-login';

test.describe.configure({ mode: 'serial' });

async function continueWithPassword(
  page: import('@playwright/test').Page,
  password: string
) {
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
}

test('password error, safe redirect, signed-in entry and forced password change', async ({
  page,
  e2eContext,
}) => {
  test.setTimeout(90_000);
  await page.goto('/auth/login?redirectTo=https%3A%2F%2Fevil.example');
  await page.getByLabel('Email or class code', { exact: true }).fill(
    e2eContext.userEmail
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await continueWithPassword(page, 'wrong-password');
  await expect(page.getByText('Invalid email or password')).toBeVisible();
  await continueWithPassword(page, 'johndoe');
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
    await submitUnifiedLogin(page, e2eContext.userEmail, 'johndoe');
    await expect(page).toHaveURL(/\/auth\/required-password-change$/);
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

test('local resolver does not authenticate or accept fixture selectors', async ({
  page,
  request,
}) => {
  const db = createE2EPrismaClient();
  const sessionsBefore = await db.session.count();
  try {
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
      .getByLabel('Email or class code', { exact: true })
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
      (await page.context().cookies()).filter((cookie) =>
        ['en_session', 'membership-id'].includes(cookie.name)
      )
    ).toEqual([]);
    expect(await db.session.count()).toBe(sessionsBefore);
  } finally {
    await db.$disconnect();
  }
});
