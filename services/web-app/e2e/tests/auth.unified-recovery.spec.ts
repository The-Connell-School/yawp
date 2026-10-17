import { test, expect, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createE2EPrismaClient } from '../prisma-client';
const qaId = (key: string) => `preview-signon-qa-${key}`;
const qaEmail = (key: string) => `${key}@signon.preview.yawp.invalid`;
const QA_CODES = {
  school: 'QA-EMAIL-101',
  full: 'QA-FULL-101',
  multiple: 'QA-MULTI-101',
};

// FAILURES.md: di-signon-fix-recovery-code-copy. No intercepted auth or enrollment.
test.skip(
  process.env.SIGNON_PREVIEW_FIXTURE_TEST !== '1',
  'Disposable local fixture database required'
);
test.describe.configure({ mode: 'serial' });
const db = createE2EPrismaClient();
const flag = 'feature_flag.unified-sign-on';
const message =
  "We couldn't find a class with that code. Check it with your teacher.";
const phase = process.env.SIGNON_RECOVERY_PHASE || 'after';
async function shot(page: Page, name: string, width: number) {
  if (!process.env.SIGNON_EVIDENCE_DIR) return;
  const dir = path.join(process.env.SIGNON_EVIDENCE_DIR, phase);
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(dir, `${name}-${width}-impl.png`),
    fullPage: true,
    mask: [
      page.locator(
        'input[type="password"], input[name="identifier"], input[name="code"], input[name="classCode"], .signon-copy b, .signon-identity'
      ),
    ],
  });
}
const snapshot = () =>
  db.orgMembership.findMany({
    where: { userId: qaId('inactive') },
    orderBy: { id: 'asc' },
    include: {
      classesAsStudent: { select: { id: true }, orderBy: { id: 'asc' } },
    },
  });
test.beforeAll(async () => {
  if (
    new URL(process.env.E2E_DATABASE_URL!).hostname !== '127.0.0.1' ||
    !process.env.E2E_DATABASE_URL!.endsWith('/yawp_pr_999565')
  )
    throw new Error('Local disposable database required');
});
test.afterAll(async () => {
  await db.$disconnect();
});
test.beforeEach(async ({ context }) => {
  const groups = randomBytes(12).toString('hex').match(/.{4}/g)!;
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `2001:db8:${groups.join(':')}`,
  });
  await db.setting.upsert({
    where: { name: flag },
    update: { value: 'true' },
    create: { name: flag, value: 'true', valueType: 'boolean' },
  });
});
async function openQa(page: Page, account: string) {
  await page.goto('/auth/preview-access');
  await page.waitForFunction(() =>
    Boolean((window as any).__reactRouterDataRouter)
  );
  await page
    .getByLabel('Access code', { exact: true })
    .fill('local-fixture-master-access');
  await page.getByRole('button', { name: 'Open preview', exact: true }).click();
  await page
    .getByLabel('Sign-on QA account', { exact: true })
    .selectOption(account);
  await page
    .getByRole('button', { name: 'Open sign-on QA', exact: true })
    .click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await page.waitForFunction(() =>
    Boolean((window as any).__reactRouterDataRouter)
  );
}
async function authenticate(page: Page, account: string) {
  await openQa(page, account);
  await page
    .getByLabel('Email or class code', { exact: true })
    .fill(qaEmail(account));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('yawp-dev');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: "Your account isn't active" })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Enter a class code', exact: true })
    .click();
}
for (const width of [1280, 390]) {
  for (const denial of ['inactive', 'unavailable'] as const) {
    test(`email verification enrollment ${denial} stays visible and retryable at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width,
        height: width === 1280 ? 1000 : 844,
      });
      const before = await snapshot();
      const sessions = await db.session.count({
        where: { userId: qaId('inactive') },
      });
      await openQa(page, 'inactive');
      await page
        .getByLabel('Email or class code', { exact: true })
        .fill(QA_CODES.school);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: /New Create an account/ }).click();
      await page
        .getByRole('button', { name: 'Use school email', exact: true })
        .click();
      await page
        .getByLabel('School email', { exact: true })
        .fill(qaEmail('inactive'));
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page
        .getByRole('button', { name: 'Sign in instead', exact: true })
        .click();
      await page
        .getByRole('button', {
          name: 'Email me a sign-in code instead',
          exact: true,
        })
        .click();
      await expect(page.getByLabel('Code', { exact: true })).toBeVisible();
      // Use the supported private capture API on our disposable local runtime.
      // No challenge/identity/session interception, injected OTP, or auth bypass.
      const captured = await page.request.post('/api/preview/qa/signon-code', {
        headers: {
          authorization: `Bearer ${process.env.PREVIEW_ACCESS_SECRET}`,
        },
        data: { email: qaEmail('inactive') },
      });
      expect(captured.status()).toBe(200);
      const { code } = await captured.json();
      if (denial === 'unavailable')
        await db.class.update({
          where: { id: qaId('email') },
          data: { isArchived: true },
        });
      try {
        await page.getByLabel('Code', { exact: true }).fill(code);
        const verified = page.waitForResponse(
          (r) =>
            r.request().method() === 'POST' &&
            new URLSearchParams(r.request().postData() || '').get('intent') ===
              'verify-code'
        );
        await page.getByRole('button', { name: 'Verify', exact: true }).click();
        expect((await verified).status()).toBe(400);
        await expect(page.locator('input:disabled')).toHaveCount(0);
        await shot(page, `signon-12-email-${denial}`, width);
        expect(await snapshot()).toEqual(before);
        expect(
          await db.session.count({ where: { userId: qaId('inactive') } })
        ).toBe(sessions);
        await expect(
          page.getByRole('heading', {
            name: 'Enter your class code',
            exact: true,
          })
        ).toBeVisible();
        await expect(page.getByRole('alert')).toHaveText(message);
        await expect(
          page.getByLabel('Class code', { exact: true })
        ).toBeFocused();
        await expect(
          page.getByText('Invalid code.', { exact: true })
        ).toHaveCount(0);
        await page
          .getByLabel('Class code', { exact: true })
          .fill('UNKNOWN-LOCAL-CODE');
        await page
          .getByRole('button', { name: 'Continue', exact: true })
          .click();
        await expect(page.getByRole('alert')).toHaveText(message);
        expect(await snapshot()).toEqual(before);
        // A successful OTP followed by denied enrollment never grants app access.
        const access = await page.request.get(
          `/app/my-classes/${qaId('email')}`,
          { maxRedirects: 0 }
        );
        expect(access.status()).toBe(302);
        expect(access.headers().location).toMatch(/^\/auth\/login/);
      } finally {
        if (denial === 'unavailable')
          await db.class.update({
            where: { id: qaId('email') },
            data: { isArchived: false },
          });
      }
    });
  }
  test(`inactive recovery denial preserves membership and access at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    const before = await snapshot();
    expect(before).toHaveLength(1);
    expect(before[0].isActive).toBe(false);
    await authenticate(page, 'inactive');
    const submit = async (code: string) => {
      await page.getByLabel('Class code', { exact: true }).fill(code);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    };
    // Real known-class resolution reaches the database's inactive-membership denial.
    await submit(QA_CODES.school);
    await expect(page.getByRole('alert')).toBeVisible();
    await shot(page, 'signon-12-inactive-denial', width);
    expect(await snapshot()).toEqual(before);
    const access = await page.request.get(`/app/my-classes/${qaId('email')}`, {
      maxRedirects: 0,
    });
    expect(access.status()).toBe(302);
    expect(access.headers().location).toBe('/no-membership');
    await expect(page.getByRole('alert')).toHaveText(message);
    await expect(
      page.getByLabel('Class code', { exact: true })
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Invalid code.', { exact: true })).toHaveCount(
      0
    );
    for (const code of ['UNKNOWN-LOCAL-CODE', '???', QA_CODES.school]) {
      await submit(code);
      await expect(page.getByRole('alert')).toHaveText(message);
      expect(await snapshot()).toEqual(before);
    }
    await shot(page, 'signon-12-invalid-retry', width);
    await submit(QA_CODES.multiple);
    await expect(
      page.getByRole('heading', { name: 'Which class is yours?' })
    ).toBeVisible();
    await page
      .locator(`input[type="radio"][value="${qaId('multiple-a')}"]`)
      .check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Enter your class code' })
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText(message);
    await shot(page, 'signon-12-denied-choice', width);
    expect(await snapshot()).toEqual(before);
    await submit(QA_CODES.full);
    await expect(
      page.getByRole('heading', { name: 'This class is full', exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('Ask your teacher to make room.', { exact: true })
    ).toBeVisible();
    await shot(page, 'signon-12-class-full', width);
    expect(await snapshot()).toEqual(before);
  });
  test(`authorized orphan recovery joins with trusted confirmation at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    try {
      await authenticate(page, 'orphan');
      await page
        .getByLabel('Class code', { exact: true })
        .fill(QA_CODES.school);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: "You're in!" })
      ).toBeVisible();
      expect(
        await db.orgMembership.count({
          where: {
            userId: qaId('orphan'),
            isActive: true,
            role: 'STUDENT',
            isOrgOwner: false,
            classesAsStudent: { some: { id: qaId('email') } },
          },
        })
      ).toBe(1);
      await shot(page, 'signon-44-valid-recovery', width);
      await page
        .getByRole('button', { name: 'Go to my class', exact: true })
        .click();
      await expect(page).toHaveURL(/\/app\/?$/);
      await expect(
        page.getByRole('link', { name: /Preview QA school Preview QA email/ })
      ).toBeVisible();
    } finally {
      await db.orgMembership.deleteMany({ where: { userId: qaId('orphan') } });
      await db.session.deleteMany({ where: { userId: qaId('orphan') } });
    }
  });
  test(`flag OFF keeps legacy login signup join and free entry at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await db.setting.update({
      where: { name: flag },
      data: { value: 'false' },
    });
    // Ordinary seat access remains available when the QA picker is disabled.
    await page.goto('/auth/preview-access');
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await page
      .getByLabel('Access code', { exact: true })
      .fill('local-fixture-master-access');
    await page
      .getByRole('button', { name: 'Open preview', exact: true })
      .click();
    await page
      .getByLabel('Organization', { exact: true })
      .selectOption(qaId('school'));
    await page
      .getByRole('button', { name: 'Continue to organization', exact: true })
      .click();
    await expect(page).not.toHaveURL(/preview-access/);
    for (const [route, name] of [
      ['/auth/login', 'login'],
      ['/auth/inv/signup', 'signup'],
      ['/join?t=invalid-local-token', 'join'],
      ['/free', 'free'],
    ] as const) {
      await page.goto(route);
      await expect(page.locator('[data-signon-screen]')).toHaveCount(0);
      if (name === 'login')
        await expect(
          page.getByLabel('Password', { exact: true })
        ).toBeVisible();
      await shot(page, `flag-off-${name}`, width);
    }
  });
}
