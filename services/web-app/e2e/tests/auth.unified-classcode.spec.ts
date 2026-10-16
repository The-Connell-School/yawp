import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import fs from 'node:fs';
import path from 'node:path';

test.skip(
  process.env.SIGNON_LOCAL_TEST !== '1',
  'Disposable local database only'
);
test.describe.configure({ mode: 'serial' });
const db = createE2EPrismaClient();
const id = `classcode-browser-${Date.now()}`;
const flag = 'feature_flag.unified-sign-on';
const evidence = process.env.SIGNON_EVIDENCE_DIR!;
test.beforeAll(async () => {
  if (
    !['localhost', '127.0.0.1'].includes(
      new URL(process.env.E2E_DATABASE_URL!).hostname
    )
  )
    throw Error('Local DB only');
  await db.organization.create({
    data: { id, name: 'Lincoln High', plan: 'SCHOOL' },
  });
  await db.school.create({
    data: { id, code: id, name: 'Lincoln High', organizationId: id },
  });
  await db.class.create({
    data: { id, code: id, title: 'English 11, Period 2', schoolId: id },
  });
});
test.afterAll(async () => {
  const users = await db.user.findMany({
    where: { memberships: { some: { organizationId: id } } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.signonFlow.deleteMany({});
  await db.signonIdentity.deleteMany({ where: { userId: { in: ids } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.password.deleteMany({ where: { userId: { in: ids } } });
  await db.orgMembership.deleteMany({ where: { organizationId: id } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.class.delete({ where: { id } });
  await db.school.delete({ where: { id } });
  await db.organization.delete({ where: { id } });
  await db.setting.deleteMany({ where: { name: flag } });
  await db.$disconnect();
});
for (const width of [1280, 390])
  test(`class code New and Returning real handlers at ${width}`, async ({
    page,
    context,
  }) => {
    const shot = async (name: string) => {
      fs.mkdirSync(evidence, { recursive: true });
      await page.screenshot({
        path: path.join(
          evidence,
          `${name}-${width}-${process.env.SIGNON_BEFORE === '1' ? 'before' : 'impl'}.png`
        ),
        fullPage: true,
      });
    };
    await page.setViewportSize({ width, height: width === 1280 ? 1006 : 844 });
    await db.setting.deleteMany({ where: { name: flag } });
    await page.goto('/auth/login');
    await expect(page.getByRole('button', { name: /^log in$/i })).toBeVisible();
    await shot('flag-off');
    await db.setting.upsert({
      where: { name: flag },
      update: { value: 'true' },
      create: { name: flag, value: 'true', valueType: 'boolean' },
    });
    await page.goto('/auth/login');
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await shot('signon-03-entry');
    const input = page.getByLabel(
      process.env.SIGNON_BEFORE === '1'
        ? 'Email, handle, or class code'
        : 'Email or class code',
      { exact: true }
    );
    if (process.env.SIGNON_BEFORE !== '1') {
      await input.fill('invalid-local-class');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByText(/couldn't find a class/)).toBeVisible();
      await expect(input).toBeFocused();
      await shot('entry-invalid-class');
    }
    await input.fill(id);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByText('English 11, Period 2', { exact: true })
    ).toBeVisible();
    await shot('signon-35-class-found');
    await page
      .getByRole('button', {
        name: process.env.SIGNON_BEFORE === '1' ? /I'm new to YAWP/ : /^New/,
      })
      .click();
    if (process.env.SIGNON_BEFORE === '1') {
      await expect(
        page.getByText('The passwords must match', { exact: true })
      ).toHaveCount(0);
      await shot('signon-37-register');
      return;
    }
    await expect(page.getByLabel('First name', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByLabel('First name', { exact: true }).fill('Brian');
    await page.getByLabel('Last name', { exact: true }).fill('Connell');
    await expect(
      page.getByText('@BrianConnell', { exact: true })
    ).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('local-password');
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill('different');
    await page.getByRole('button', { name: 'Join class', exact: true }).click();
    await expect(page.getByText(/match/i).first()).toBeVisible();
    await shot('signon-38-validation');
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill('local-password');
    await shot('signon-37-register');
    await page.getByRole('button', { name: 'Join class', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: "You're in!" })
    ).toBeVisible();
    const handle = width === 1280 ? 'BrianConnell' : 'BrianConnell1';
    await expect(page.getByText(`@${handle}`, { exact: true })).toBeVisible();
    await shot('generated-handle');
    await context.clearCookies();
    await page.goto('/auth/login');
    await page.getByLabel('Email or class code', { exact: true }).fill(id);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: /^Returning/ }).click();
    await page.getByLabel('Handle', { exact: true }).fill(handle);
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    await expect(
      page.getByText("That handle and password don't match.")
    ).toBeVisible();
    await shot('signon-42-returning-error');
    await page.getByLabel('Password', { exact: true }).fill('local-password');
    await expect(
      page.getByText("That handle and password don't match.")
    ).toHaveCount(0);
    await shot('signon-41-returning');
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    await expect(page).toHaveURL(/\/app/);
  });
for (const width of [1280, 390])
  test(`Google new identity requires class code and ignores email at ${width}`, async ({
    page,
  }) => {
    test.skip(
      process.env.SIGNON_MOCK_GOOGLE !== '1',
      'Local signed provider mock required'
    );
    await db.setting.upsert({
      where: { name: flag },
      update: { value: 'true' },
      create: { name: flag, value: 'true', valueType: 'boolean' },
    });
    await page.setViewportSize({ width, height: width === 1280 ? 1006 : 844 });
    const email = `ignored${width}@yawp.local`;
    await page.route(
      'https://accounts.google.com/o/oauth2/v2/auth?**',
      async (route) => {
        const authorization = new URL(route.request().url());
        const callback = new URL(
          authorization.searchParams.get('redirect_uri')!
        );
        callback.searchParams.set(
          'state',
          authorization.searchParams.get('state')!
        );
        callback.searchParams.set(
          'code',
          Buffer.from(
            JSON.stringify({
              email,
              subject: `${id}-${width}`,
              nonce: authorization.searchParams.get('nonce'),
              challenge: authorization.searchParams.get('code_challenge'),
            })
          ).toString('base64url')
        );
        await route.fulfill({
          status: 302,
          headers: { location: callback.toString() },
        });
      }
    );
    await page.goto('/auth/login');
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(
      page.getByRole('heading', { name: 'Enter your class code' })
    ).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: path.join(evidence, `google-class-code-${width}-impl.png`),
      fullPage: true,
    });
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await page.getByLabel('Class code', { exact: true }).fill(id);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByLabel('First name', { exact: true }).fill('Google');
    await page.getByLabel('Last name', { exact: true }).fill('Student');
    await page.getByLabel('Password', { exact: true }).fill('local-password');
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill('local-password');
    await page.getByRole('button', { name: 'Join class', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: "You're in!" })
    ).toBeVisible();
    expect(await db.user.count({ where: { email } })).toBe(0);
    const linked = await db.signonIdentity.findUniqueOrThrow({
      where: {
        provider_subject: { provider: 'google', subject: `${id}-${width}` },
      },
      include: { user: true },
    });
    expect(linked.user.email).toBeNull();
    expect(linked.user.username).toBeTruthy();
  });
