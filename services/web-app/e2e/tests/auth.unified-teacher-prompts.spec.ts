import { test, expect, type Page } from '@playwright/test';
import { createCookieSessionStorage } from 'react-router';
import { createE2EPrismaClient } from '../prisma-client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

// The test-only Vite harness mocks flag reads; no Setting rows are changed.
test.skip(
  process.env.SIGNON_LOCAL_TEST !== '1',
  'Disposable local test database only'
);
test.describe.configure({ mode: 'serial' });
const db = createE2EPrismaClient();
const prefix = `teacher-prompts-${Date.now()}`;
let storedFlagsBefore = '';
const storedFlags = async () =>
  JSON.stringify(
    await db.setting.findMany({
      where: { name: { startsWith: 'feature_flag.' } },
      orderBy: { name: 'asc' },
    })
  );

const email = `maya.${Date.now().toString(36).slice(-3)}@school.test`;
const handle = `maya_${Date.now().toString(36).slice(-4)}`;
const singleCode = `${prefix}-single`;
const ambiguousCode = `${prefix}-shared`;
const targetOrganizationId = `${prefix}-target`;
const copy =
  "You're not in any active classes. Join one with a class code, or ask your teacher to add you back.";
const explanation =
  'Teacher accounts need a school email. Sign out and start a free classroom with your school email.';

async function flag(enabled: boolean) {
  if (!process.env.SIGNON_TEACHER_PROMPTS_MOCK_STATE)
    throw Error('Use playwright.teacher-prompts.config.ts');
  fs.writeFileSync(
    process.env.SIGNON_TEACHER_PROMPTS_MOCK_STATE,
    JSON.stringify({ teacherPrompts: enabled })
  );
}

test.beforeAll(async () => {
  if (
    !['localhost', '127.0.0.1'].includes(
      new URL(process.env.E2E_DATABASE_URL!).hostname
    )
  )
    throw Error('Local disposable DB required');
  storedFlagsBefore = await storedFlags();
  await flag(true);
  await db.organization.create({
    data: { id: prefix, name: 'Prompt fixture', plan: 'SCHOOL' },
  });
  await db.organization.create({
    data: {
      id: targetOrganizationId,
      name: 'New prompt classroom',
      plan: 'SCHOOL',
    },
  });
  for (const id of [prefix, `${prefix}-second`]) {
    await db.school.create({
      data: {
        id,
        code: id,
        name: 'Prompt school',
        organizationId: targetOrganizationId,
      },
    });
  }
  for (const [suffix, code, title] of [
    ['single', singleCode, 'Prompt English'],
    ['first', ambiguousCode, 'Prompt History'],
    ['second', ambiguousCode, 'Prompt Science'],
  ]) {
    await db.class.create({
      data: {
        id: `${prefix}-${suffix}`,
        code,
        title,
        schoolId: suffix === 'second' ? `${prefix}-second` : prefix,
      },
    });
  }
  const hash = await bcrypt.hash('local-prompt-password', 4);
  for (const kind of [
    'email',
    'handle',
    'neutral',
    'staff',
    'direct-1280',
    'direct-390',
    'ambiguous-1280',
    'ambiguous-390',
  ]) {
    await db.user.create({
      data: {
        id: `${prefix}-${kind}`,
        name: 'Maya',
        password: { create: { hash } },
        email:
          kind === 'handle'
            ? null
            : kind === 'email'
              ? email
              : `${prefix}-${kind}@example.test`,
        username: kind === 'handle' ? handle : null,
        ...(kind === 'neutral'
          ? {}
          : {
              memberships: {
                create: {
                  id: `${prefix}-${kind}`,
                  organizationId: prefix,
                  role: kind === 'staff' ? 'TEACHER' : 'STUDENT',
                  isActive: false,
                },
              },
            }),
      },
    });
  }
});

test.afterAll(async () => {
  await db.signonFlow.deleteMany({
    where: { data: { path: ['userId'], string_starts_with: prefix } },
  });
  await db.session.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.orgMembership.deleteMany({
    where: { organizationId: { in: [prefix, targetOrganizationId] } },
  });
  await db.password.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.class.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.school.deleteMany({
    where: { organizationId: targetOrganizationId },
  });
  await db.organization.deleteMany({
    where: { id: { in: [prefix, targetOrganizationId] } },
  });
  expect(await storedFlags()).toBe(storedFlagsBefore);
  await db.$disconnect();
});

async function authenticate(page: Page, kind: string) {
  const session = await db.session.create({
    data: {
      userId: `${prefix}-${kind}`,
      expirationDate: new Date(Date.now() + 3600000),
    },
  });
  const storage = createCookieSessionStorage({
    cookie: {
      name: 'en_session',
      secrets: process.env.SESSION_SECRET!.split(','),
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    },
  });
  const cookie = await storage.getSession();
  cookie.set('sessionId', session.id);
  const value = (await storage.commitSession(cookie))
    .split(';')[0]
    .slice('en_session='.length);
  await page.context().addCookies([
    {
      name: 'en_session',
      value: decodeURIComponent(value),
      url: test.info().project.use.baseURL!,
    },
  ]);
  return session.id;
}

async function shot(page: Page, name: string, width: number) {
  const dir = process.env.SIGNON_EVIDENCE_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  if (name !== 'flag-off-inactive') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const root = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.root.nodeId,
      selector: 'h1',
    });
    const platform = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    await cdp.detach();
    const computed = await page.locator('h1').evaluate((node) => ({
      family: getComputedStyle(node).fontFamily,
      size: getComputedStyle(node).fontSize,
      weight: getComputedStyle(node).fontWeight,
    }));
    fs.writeFileSync(
      path.join(dir, `${name}-${width}-typography.json`),
      JSON.stringify({ ...computed, platform })
    );
  }
  await page.screenshot({
    path: path.join(
      dir,
      `built-${name}-${width === 1280 ? 'desktop' : 'mobile'}.png`
    ),
    fullPage: true,
    style: '.local-dev-environment-control { visibility: hidden; }',
  });
}

for (const width of [1280, 390]) {
  for (const journey of ['direct', 'ambiguous']) {
    test(`${journey} valid code preserves enrollment and continuation after reload at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width,
        height: width === 1280 ? 1000 : 844,
      });
      const kind = `${journey}-${width}`;
      const userId = `${prefix}-${kind}`;
      const classId = `${prefix}-${journey === 'direct' ? 'single' : 'second'}`;
      const className =
        journey === 'direct' ? 'Prompt English' : 'Prompt Science';
      await authenticate(page, kind);
      await page.goto(journey === 'direct' ? '/enter-code' : '/no-membership');
      if (journey === 'ambiguous') {
        await page
          .getByRole('button', { name: 'Enter a class code', exact: true })
          .click();
        await expect(page.getByLabel('Class code', { exact: true })).toBeVisible();
      }
      const flowCookie = (await page.context().cookies()).find(
        (c) => c.name === 'yawp_signon'
      )!;
      await page
        .getByLabel('Class code', { exact: true })
        .fill(journey === 'direct' ? singleCode : ambiguousCode);
      await page
        .getByRole('button', { name: 'Join class', exact: true })
        .click();
      if (journey === 'ambiguous') {
        await expect(
          page.getByRole('heading', { name: 'Which class is yours?' })
        ).toBeVisible();
        await expect(page.getByRole('radio')).toHaveCount(2);
        await page.reload();
        await expect(
          page.getByRole('heading', { name: 'Which class is yours?' })
        ).toBeVisible();
        await expect(page.getByRole('radio')).toHaveCount(2);
        await page.getByRole('radio', { name: /Prompt Science/ }).check();
        await page
          .getByRole('button', { name: 'Continue', exact: true })
          .click();
      }
      await expect(
        page.getByRole('heading', { name: "You're in!", exact: true })
      ).toBeVisible();
      await expect(page.getByText(className, { exact: true })).toBeVisible();
      const enrollment = () =>
        db.orgMembership.findFirst({
          where: {
            userId,
            isActive: true,
            role: 'STUDENT',
            classesAsStudent: { some: { id: classId } },
          },
          select: { id: true, classesAsStudent: { select: { id: true } } },
        });
      await expect
        .poll(enrollment)
        .toMatchObject({ classesAsStudent: [{ id: classId }] });
      await page.reload();
      await expect(
        page.getByRole('heading', { name: "You're in!", exact: true })
      ).toBeVisible();
      await expect(page.getByText(className, { exact: true })).toBeVisible();
      expect(
        (await page.context().cookies()).find((c) => c.name === 'yawp_signon')
          ?.value
      ).toBe(flowCookie.value);
      await page
        .getByRole('button', { name: 'Go to my class', exact: true })
        .click();
      await expect(page).toHaveURL(/\/app\/?$/);
      await expect(
        page.getByRole('heading', { name: 'Welcome, Maya!' })
      ).toBeVisible();
      await expect(page.getByText(className, { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText(className, { exact: true })).toBeVisible();
      expect(await enrollment()).not.toBeNull();
      expect(
        await db.orgMembership.findUnique({
          where: { id: userId },
          select: { isActive: true },
        })
      ).toEqual({ isActive: false });
    });
  }

  test(`inactive email student and signed-in class code at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await authenticate(page, 'email');
    await page.goto('/no-membership');
    await expect(
      page.getByRole('heading', { name: "Your account isn't active" })
    ).toBeVisible();
    await expect(page.getByText(copy, { exact: true })).toBeVisible();
    await expect(page.locator('.signon-identity')).toContainText(email);
    await expect(
      page.getByRole('link', { name: 'Start a free classroom', exact: true })
    ).toHaveAttribute('href', '/free');
    await expect(
      page.getByRole('button', { name: 'Sign out', exact: true })
    ).toBeVisible();
    await shot(page, 'inactive', width);
    await page
      .getByRole('button', { name: 'Enter a class code', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Enter your class code' })
    ).toBeVisible();
    await expect(page.getByLabel('Class code', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Your teacher has it.', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Join class', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: 'Teachers can start a free classroom',
        exact: true,
      })
    ).toHaveAttribute('href', '/free');
    await shot(page, 'classcode', width);
    await page
      .getByLabel('Class code', { exact: true })
      .fill('UNKNOWN-LOCAL-CODE');
    await page.getByRole('button', { name: 'Join class', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    const access = await page.request.get('/app/', { maxRedirects: 0 });
    expect(access.headers().location).toMatch(/auth\/login/);
  });

  for (const screen of ['inactive', 'classcode']) {
    test(`handle-only ${screen} signs out before free entry at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width,
        height: width === 1280 ? 1000 : 844,
      });
      const sessionId = await authenticate(page, 'handle');
      await page.goto(screen === 'inactive' ? '/no-membership' : '/enter-code');
      await expect(page.locator('.signon-identity')).toContainText(
        `@${handle}`
      );
      await expect(page.getByText(explanation, { exact: true })).toBeVisible();
      await expect(
        page.getByRole('link', { name: /free classroom/ })
      ).toHaveCount(0);
      if (screen === 'inactive') {
        await expect(
          page.getByRole('button', { name: 'Enter a class code' })
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Sign out', exact: true })
        ).toBeVisible();
      }
      const button = page.getByRole('button', {
        name: 'Sign out and continue',
        exact: true,
      });
      await expect(button.locator('xpath=ancestor::form')).toHaveAttribute(
        'method',
        'post'
      );
      await expect(button.locator('xpath=ancestor::form')).toHaveAttribute(
        'action',
        '/auth/logout?redirectTo=%2Ffree'
      );
      await shot(page, `handleonly-${screen}`, width);
      const post = page.waitForRequest(
        (r) =>
          new URL(r.url()).pathname === '/auth/logout' && r.method() === 'POST'
      );
      await button.click();
      await post;
      await expect(page).toHaveURL(/\/free$/);
      await expect
        .poll(() => db.session.count({ where: { id: sessionId } }))
        .toBe(0);
      const access = await page.request.get('/app/', { maxRedirects: 0 });
      expect(access.status()).toBe(302);
      expect(access.headers().location).toMatch(/auth\/login/);
    });
  }

  test(`no roles uses neutral inactive copy at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await authenticate(page, 'neutral');
    await page.goto('/no-membership');
    await expect(page.getByText(copy, { exact: true })).toBeVisible();
    await expect(
      page.getByText('Ask your school admin to turn it back on.')
    ).toHaveCount(0);
  });
}

test('flag off preserves the legacy no-membership DOM', async ({ page }) => {
  await flag(false);
  try {
    await authenticate(page, 'neutral');
    await page.goto('/no-membership');
    await expect(page.locator('h1')).toHaveText('No Membership');
    await expect(
      page.getByText(
        "You don't have an organization membership yet. Please contact your administrator."
      )
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Retry', exact: true })
    ).toHaveAttribute('href', '/app');
    await expect(
      page.getByRole('button', { name: 'Log out', exact: true })
    ).toBeVisible();
    await expect(page.locator('.unified-signon')).toHaveCount(0);
    await shot(page, 'flag-off-inactive', 1280);
    await expect(page.getByText(/free classroom/)).toHaveCount(0);
  } finally {
    await flag(true);
  }
});

test('password sign-in keeps neutral accounts on the neutral inactive screen', async ({
  page,
}) => {
  await page.goto('/auth/login');
  await page
    .getByLabel('Email or class code', { exact: true })
    .fill(`${prefix}-neutral@example.test`);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page
    .getByLabel('Password', { exact: true })
    .fill('local-prompt-password');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: "Your account isn't active" })
  ).toBeVisible();
  await expect(page.getByText(copy, { exact: true })).toBeVisible();
  await expect(page.locator('.signon-identity')).toContainText(
    `${prefix}-neutral@example.test`
  );
});

test('flag off preserves the unified inactive variant', async ({ page }) => {
  await flag(false);
  try {
    await page.goto('/auth/login');
    await page.getByLabel('Email or class code', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page
      .getByLabel('Password', { exact: true })
      .fill('local-prompt-password');
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    await expect(
      page.getByText('You are not in any active classes.', { exact: true })
    ).toBeVisible();
    await expect(page.locator('.signon-identity')).toHaveCount(0);
    await expect(page.getByText(/free classroom/)).toHaveCount(0);
  } finally {
    await flag(true);
  }
});
