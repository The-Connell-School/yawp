import { createCookieSessionStorage } from 'react-router';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import { waitForFreeTierEmailPayload } from '../helpers/free-tier-email';

// Dedicated worktree database; no hosted environments or delivered email.
if (!process.env.CLASS_STEP_PORT) {
  throw new Error(
    'Run class-step tests with ./bin/project test --profile free-tier-class-step-browser'
  );
}
process.env.E2E_DATABASE_URL ??= process.env.DATABASE_URL;
const prisma = createE2EPrismaClient();
const shots = process.env.CLASS_STEP_EVIDENCE_DIR;
const users: string[] = [];
const apps: string[] = [];
const flagName = 'feature_flag.free_tier';
async function flag(enabled: boolean) {
  await prisma.setting.upsert({
    where: { name: flagName },
    create: { name: flagName, value: String(enabled), valueType: 'boolean' },
    update: { value: String(enabled) },
  });
}
async function fixture(
  gradeLevel = '11',
  status: 'ACCOUNT_CREATED' | 'SENT' = 'ACCOUNT_CREATED'
) {
  const user = await prisma.user.create({
    data: {
      email: `class-step-${crypto.randomUUID()}@example.edu`,
      name: 'Grace Okafor',
      memberships: {
        create: { organizationId: 'default-org', role: 'TEACHER' },
      },
    },
  });
  users.push(user.id);
  const app = await prisma.freeTierApplication.create({
    data: {
      userId: user.id,
      email: user.email!,
      name: user.name!,
      schoolName: 'Lincoln High',
      location: 'Local',
      gradeLevel,
      status,
    },
  });
  apps.push(app.id);
  return { user, app };
}
async function login(page: import('@playwright/test').Page, email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const session = await prisma.session.create({
    data: { userId: user.id, expirationDate: new Date(Date.now() + 3600000) },
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
  await page
    .context()
    .addCookies([
      {
        name: 'en_session',
        value,
        url: new URL(
          page.url() === 'about:blank'
            ? `http://localhost:${process.env.CLASS_STEP_PORT}`
            : page.url()
        ).origin,
      },
    ]);
  await page.goto('/app/free-tier/onboarding');
}
async function capture(page: import('@playwright/test').Page, state: string) {
  if (!shots) return;
  fs.mkdirSync(shots, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(shots, `${state}-impl.png`),
    fullPage: true,
  });
}
test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => {
  await prisma.organization.upsert({
    where: { id: 'default-org' },
    create: {
      id: 'default-org',
      name: 'Local onboarding placeholder',
      plan: 'FREE_CLASSROOM',
    },
    update: { plan: 'FREE_CLASSROOM' },
  });
  await prisma.setting.upsert({
    where: { name: 'feature_flag.free_tier' },
    create: {
      name: 'feature_flag.free_tier',
      value: 'true',
      valueType: 'boolean',
    },
    update: { value: 'true' },
  });
  await flag(true);
});
test.afterAll(async () => {
  await flag(false);
  const applications = await prisma.freeTierApplication.findMany({
    where: { id: { in: apps } },
    select: { organizationId: true },
  });
  const orgIds = applications.flatMap((app) =>
    app.organizationId ? [app.organizationId] : []
  );
  await prisma.freeTierApplication.deleteMany({ where: { id: { in: apps } } });
  await prisma.class.deleteMany({
    where: { school: { organizationId: { in: orgIds } } },
  });
  await prisma.orgMembership.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.school.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organizationAssignmentType.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: users } } });
  await prisma.orgMembership.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});
for (const width of [1280, 390]) {
  test(`class step persists, validates, and enforces progression at ${width}px`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const { user, app } = await fixture();
    await login(page, user.email!);
    await expect(
      page.getByRole('heading', { name: 'Create your class' })
    ).toBeVisible();
    await expect(page.getByLabel('Grade')).toHaveValue('11');
    await expect(page.locator('[aria-current="step"]')).toContainText(
      'Create your class'
    );
    await page.getByLabel('Class name').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Grade')).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await capture(page, `${width}-create-class`);
    await page.getByLabel('Class name').fill('AP English 11');
    await page.getByLabel('Grade').selectOption('mixed');
    await capture(page, `${width}-grade-selection`);
    await page.getByLabel('Class name').fill('');
    await page.getByLabel('Grade').selectOption('11');
    const blocked = await page.request.post(
      '/app/free-tier/onboarding?step=administrator',
      {
        form: {
          adminName: 'Dr. Patel',
          adminEmail: 'patel@example.edu',
          adminRole: 'Principal',
        },
        maxRedirects: 0,
      }
    );
    expect(blocked.status()).toBe(302);
    expect(blocked.headers().location).toBe('/app/free-tier/onboarding');
    const pendingPost = await page.request.post('/app/free-tier/pending', {
      form: { intent: 'resend' },
      maxRedirects: 0,
    });
    expect(pendingPost.headers().location).toBe('/app/free-tier/onboarding');
    await page.goto('/app/free-tier/onboarding?step=administrator');
    await expect(
      page.getByRole('heading', { name: 'Create your class' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('#className:invalid')).toHaveCount(1);
    // Exercise associated server errors with browser validation deliberately bypassed.
    await page
      .locator('form')
      .first()
      .evaluate((el) => el.setAttribute('novalidate', ''));
    await page.getByLabel('Class name').fill('   ');
    await page.getByLabel('Grade').selectOption('');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByText('Enter a class name with 1–100 characters.')
    ).toBeVisible();
    await expect(page.getByLabel('Grade')).toHaveAttribute(
      'aria-describedby',
      /class-grade-error/
    );
    await capture(page, `${width}-validation`);
    await page.getByLabel('Class name').fill('AP English 11');
    await page.getByLabel('Grade').selectOption('mixed');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Ask your administrator' })
    ).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toContainText(
      'Ask your administrator'
    );
    await capture(page, `${width}-administrator`);
    await page.getByRole('link', { name: 'Back to your class' }).click();
    await expect(page).toHaveURL(/step=class/);
    await expect(page.getByLabel('Class name')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Class name')).toHaveValue('AP English 11');
    await expect(page.getByLabel('Grade')).toHaveValue('mixed');
    const stored = await prisma.freeTierApplication.findUniqueOrThrow({
      where: { id: app.id },
    });
    expect(stored.starterClassName).toBe('AP English 11');
    expect(stored.starterClassGrade).toBe('mixed');
    expect(stored.status).toBe('ACCOUNT_CREATED');
    expect(stored.organizationId).toBeNull();
    expect(
      await prisma.freeTierEmailLog.count({ where: { applicationId: app.id } })
    ).toBe(0);
    await page.goto('/app/my-classes');
    await expect(page).toHaveURL(/free-tier\/onboarding/);
    await page.getByLabel('Administrator name').fill('Dr. Patel');
    const selfPost = await page.request.post('/app/free-tier/onboarding', {
      form: {
        adminName: 'Self',
        adminEmail: user.email!.toUpperCase(),
        adminRole: 'Principal',
      },
      maxRedirects: 0,
    });
    expect(selfPost.status()).toBe(400);
    const ownEmail = page.getByLabel('Administrator email');
    await ownEmail.fill(user.email!);
    await page.getByLabel('Administrator role').fill('Principal');
    await page.getByRole('button', { name: 'Send approval request' }).click();
    await expect(ownEmail).toHaveAttribute('aria-invalid', 'true');
    await expect(ownEmail).toHaveAttribute('aria-describedby', 'adminEmail-error');
    await expect(page.locator('#adminEmail-error')).toHaveText(
      "Use your administrator's email here, not your own."
    );
    await capture(page, `${width}-self-administrator-validation`);
    expect(
      await prisma.freeTierAdminApproval.count({ where: { applicationId: app.id } })
    ).toBe(0);
    expect(
      await prisma.freeTierEmailLog.count({ where: { applicationId: app.id } })
    ).toBe(0);
    expect(
      (await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } })).status
    ).toBe('ACCOUNT_CREATED');
    await ownEmail.fill('patel@example.edu');
    await expect(ownEmail).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Administrator role').fill('Principal');
    await page.getByRole('button', { name: 'Send approval request' }).click();
    await expect(page).toHaveURL(/free-tier\/pending/);
    const payload = await waitForFreeTierEmailPayload(prisma, {
      applicationId: app.id,
      kind: 'admin_approval',
    });
    expect(
      await prisma.freeTierAdminApproval.count({
        where: { applicationId: app.id },
      })
    ).toBe(1);
    // Back navigation and duplicate POSTs must never resend the request.
    const retry = await page.request.post('/app/free-tier/onboarding', {
      form: { intent: 'prepare-class', className: 'Other class', grade: '9' },
      maxRedirects: 0,
    });
    expect(retry.headers().location).toBe('/app/free-tier/pending');
    expect(
      await prisma.freeTierEmailLog.count({ where: { applicationId: app.id } })
    ).toBe(1);
    const admin = await browser.newPage();
    try {
      await admin.goto(payload.approveUrl);
      await admin.getByLabel('Your role').fill('Principal');
      await admin
        .getByRole('checkbox', { name: /I can approve classroom software/ })
        .check();
      await admin
        .getByRole('button', { name: 'Approve YAWP', exact: true })
        .click();
      await expect(
        admin.getByRole('heading', { name: 'Thank you', exact: true })
      ).toBeVisible({ timeout: 30000 });
      await page.goto('/app/my-classes');
      await expect(page).toHaveURL(/my-classes/);
      const approved = await prisma.freeTierApplication.findUniqueOrThrow({
        where: { id: app.id },
      });
      const classes = await prisma.class.findMany({
        where: { school: { organizationId: approved.organizationId! } },
      });
      expect(classes).toHaveLength(1);
      expect(classes[0]).toMatchObject({
        title: 'AP English 11',
        grade: 'mixed',
      });
    } finally {
      await admin.close();
    }
  });
}
test('missing and unsupported grades require an explicit choice', async ({
  page,
}) => {
  for (const grade of ['', '8', '9–12']) {
    const { user } = await fixture(grade);
    await login(page, user.email!);
    await expect(page.getByLabel('Grade')).toHaveValue('');
    await expect(page.getByLabel('Grade').locator('option')).toHaveText([
      'Choose a grade',
      '9',
      '10',
      '11',
      '12',
      'Mixed grades',
    ]);
  }
});
test('flag off and paid memberships preserve legacy onboarding; existing requests stay pending', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const { user } = await fixture();
  await flag(false);
  await login(page, user.email!);
  await expect(
    page.getByRole('heading', { name: 'Who can approve YAWP?' })
  ).toBeVisible();
  await expect(page.getByLabel('Class name')).toHaveCount(0);
  await capture(page, '1280-legacy');
  await flag(true);
  const paid = await fixture();
  const org = await prisma.organization.create({
    data: { name: 'Local paid membership control', plan: 'CLASSROOM_LICENSE' },
  });
  try {
    await prisma.orgMembership.create({
      data: { userId: paid.user.id, organizationId: org.id, role: 'TEACHER' },
    });
    await login(page, paid.user.email!);
    await expect(
      page.getByRole('heading', { name: 'Who can approve YAWP?' })
    ).toBeVisible();
    await expect(page.getByLabel('Class name')).toHaveCount(0);
    await capture(page, '1280-non-free');
    await page.request.post('/app/free-tier/onboarding', {
      form: { intent: 'prepare-class', className: 'Blocked class', grade: '11' },
    });
    const unchanged = await prisma.freeTierApplication.findUniqueOrThrow({
      where: { id: paid.app.id },
    });
    expect(unchanged.starterClassName).toBeNull();
    expect(unchanged.starterClassGrade).toBeNull();
    expect(unchanged.status).toBe('ACCOUNT_CREATED');
    expect(
      await prisma.class.count({
        where: { teachers: { some: { userId: paid.user.id } } },
      })
    ).toBe(0);
  } finally {
    await prisma.orgMembership.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
  const inflight = await fixture('10', 'SENT');
  await login(page, inflight.user.email!);
  await expect(page).toHaveURL(/free-tier\/pending/);
  expect(
    await prisma.freeTierAdminApproval.count({
      where: { applicationId: inflight.app.id },
    })
  ).toBe(0);
});
test('unauthenticated requests cannot prepare a class', async ({ page }) => {
  const response = await page.request.post('/app/free-tier/onboarding', {
    form: { intent: 'prepare-class', className: 'English', grade: '11' },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(302);
  expect(response.headers().location).toContain('/auth/login');
});
