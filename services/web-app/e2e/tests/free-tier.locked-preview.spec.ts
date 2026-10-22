import { createCookieSessionStorage } from 'react-router';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import { provisionFreeClassroomForE2E } from '../helpers/provision-free-classroom-for-e2e';
if (!process.env.CLASS_STEP_PORT) {
  throw new Error(
    'Run class-step tests with ./bin/project test --profile free-tier-locked-preview-browser'
  );
}
process.env.E2E_DATABASE_URL ??= process.env.DATABASE_URL;
const prisma = createE2EPrismaClient();
const shots = process.env.LOCKED_PREVIEW_EVIDENCE_DIR;
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
  status: 'ACCOUNT_CREATED' | 'SENT' | 'MANUAL_REVIEW' = 'ACCOUNT_CREATED'
) {
  const user = await prisma.user.create({
    data: {
      email: `locked-preview-${crypto.randomUUID()}@example.edu`,
      name: 'Grace Okafor',
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
  if (status === 'SENT') {
    await prisma.freeTierAdminApproval.create({
      data: {
        applicationId: app.id,
        adminName: 'Dr. Patel',
        adminEmail: 'principal@example.test',
        emailCopyVersionHash: 'local-locked-preview',
        firstSentAt: new Date('2026-10-14T15:00:00Z'),
      },
    });
  }
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
  await page.context().addCookies([
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
}

async function provisionPendingClassroom(appId: string, userId: string) {
  provisionFreeClassroomForE2E(appId);
  const app = await prisma.freeTierApplication.findUniqueOrThrow({
    where: { id: appId },
    select: { organizationId: true },
  });
  expect(app.organizationId).toBeTruthy();
  await prisma.orgMembership.findFirstOrThrow({
    where: { userId, organizationId: app.organizationId! },
  });
}

async function capture(page: import('@playwright/test').Page, state: string) {
  if (!shots) return;
  fs.mkdirSync(shots, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(shots, `${state}-impl.png`),
    fullPage: true,
    animations: 'disabled',
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

for (const width of [390, 1440]) {
  test(`waiting teacher explores the real app in locked mode at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { user, app } = await fixture('11', 'SENT');
    await provisionPendingClassroom(app.id, user.id!);
    await login(page, user.email!);
    await page.goto('/app/free-tier/pending');
    await expect(page).toHaveURL(/\/app\/free-tier\/pending$/);
    await expect(page.getByText(/Sent to Dr\. Patel on/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Not the right person?' })
    ).toBeVisible();
    await capture(page, `waiting-${width}`);
    await page.getByRole('link', { name: 'Explore my classroom' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId('teaching-access-banner')).toBeVisible();
    await expect(
      page
        .getByTestId('teaching-access-banner')
        .getByText(/Waiting for Dr\. Patel to approve your classroom/)
    ).toBeVisible();
    await capture(page, `locked-app-before-${width}`);
    await page
      .getByRole('button', { name: /New Class Starter assignment/i })
      .click();
    await expect(page.getByRole('heading', { name: 'New assignment' })).toBeVisible();
    await expect(page.getByText('Choose a type.')).toBeVisible();
    const lockedTileImg = page
      .locator('[data-testid="site-license-locked-assignment-tile"] img')
      .first();
    if (width === 1440 && (await lockedTileImg.count())) {
      const imgBox = await lockedTileImg.boundingBox();
      expect(imgBox?.height ?? 0).toBeLessThanOrEqual(64);
      const siteLock = page.getByTestId('site-license-lock-button').first();
      await siteLock.focus();
      await page.waitForTimeout(350);
      await expect(
        page.getByRole('tooltip', { name: /Available with a site license/i })
      ).toBeVisible();
      await siteLock.blur();
    }
    if (width === 390 && (await lockedTileImg.count())) {
      const imgBox = await lockedTileImg.boundingBox();
      expect(imgBox?.height ?? 0).toBeLessThanOrEqual(56);
    }
    await capture(page, `locked-picker-${width}`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'New assignment' })).toHaveCount(
      0
    );
    if (width === 1440) {
      const create = page.getByRole('button', { name: 'Create assignment' }).first();
      await create.hover();
      await page.waitForTimeout(350);
      await expect(
        page.getByRole('tooltip', {
          name: /Unlocks once your administrator approves/,
        })
      ).toBeVisible();
      await create.focus();
      await expect(
        page.getByRole('tooltip', {
          name: /Unlocks once your administrator approves/,
        })
      ).toBeVisible();
    } else {
      const mobileCreate = page
        .getByTestId('free-assignment-tiles')
        .getByRole('button', { name: 'Create assignment' });
      await mobileCreate.scrollIntoViewIfNeeded();
      await mobileCreate.click({ force: true, timeout: 15_000 });
      await expect(
        page.getByRole('heading', { name: 'Unlocks after approval' })
      ).toBeVisible();
      const sheet = page.getByRole('dialog');
      const box = await sheet.boundingBox();
      expect(box?.height ?? 0).toBeLessThan(900 * 0.75);
      await page.getByRole('button', { name: 'Got it' }).click();
    }
    if (width === 390) {
      await expect(
        page.getByTestId('teaching-access-banner').getByText(/View status/)
      ).toBeVisible();
      await expect(
        page.getByTestId('teaching-access-banner').getByText(/\.\.\./)
      ).toHaveCount(0);
    }
    const before = await prisma.assignment.count();
    for (const path of [
      '/api/assignments/create',
      '/api/domain/reporter',
      '/api/domain/lesson-planner',
      '/app/organization/students',
    ]) {
      const response = await page.request.post(path, {
        form: { intent: 'create' },
        maxRedirects: 0,
      });
      expect(response.status(), path).toBe(403);
    }
    expect(await prisma.assignment.count()).toBe(before);
    await prisma.freeTierApplication.update({
      where: { id: app.id },
      data: { status: 'APPROVED' },
    });
    await page.reload();
    await expect(page.getByTestId('teaching-access-banner')).toHaveCount(0);
    await expect(page.getByTestId('teaching-access-approval-toast')).toBeVisible();
    await page
      .getByTestId('teaching-access-approval-toast')
      .getByRole('button', { name: 'Dismiss' })
      .click();
    await expect(page.getByTestId('teaching-access-approval-toast')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('teaching-access-approval-toast')).toHaveCount(0);
    await page.goto('/app/assignments');
    await expect(page.getByRole('heading', { name: 'My Assignments', exact: true })).toBeVisible();
    await capture(page, `approved-assignments-${width}`);
  });
}

test('stale tab blocked POST returns approval_required without changing page state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { user, app } = await fixture('11', 'SENT');
  await provisionPendingClassroom(app.id, user.id!);
  await login(page, user.email!);
  await page.goto('/app/free-tier/pending');
  await page.getByRole('link', { name: 'Explore my classroom' }).click();
  await prisma.freeTierApplication.update({
    where: { id: app.id },
    data: { status: 'APPROVED' },
  });
  await expect
    .poll(async () => {
      const row = await prisma.freeTierApplication.findUnique({
        where: { id: app.id },
        select: { status: true },
      });
      return row?.status;
    })
    .toBe('APPROVED');
  await page.goto('/app');
  await expect(page.getByTestId('teaching-access-banner')).toHaveCount(0);
  await expect(page.getByTestId('teaching-access-approval-toast')).toBeVisible({
    timeout: 30_000,
  });
  await prisma.freeTierApplication.update({
    where: { id: app.id },
    data: { status: 'SENT' },
  });
  await expect
    .poll(async () => {
      const row = await prisma.freeTierApplication.findUnique({
        where: { id: app.id },
        select: { status: true },
      });
      return row?.status;
    })
    .toBe('SENT');
  const blocked = await page.evaluate(async () => {
    const body = new FormData();
    body.set('intent', 'create');
    const response = await fetch('/api/assignments/create', {
      method: 'POST',
      body,
    });
    const payload = await response.json().catch(() => null);
    return { status: response.status, payload };
  });
  expect(blocked.status).toBe(403);
  expect(blocked.payload?.error).toBe('approval_required');
});

test('legacy public enrollment cannot bypass pending approval', async ({ page }) => {
  const { app, user } = await fixture('11', 'SENT');
  await provisionPendingClassroom(app.id, user.id!);
  const org = await prisma.freeTierApplication.findUniqueOrThrow({
    where: { id: app.id },
    select: { organizationId: true },
  });
  const school = await prisma.school.create({
    data: {
      name: 'Local invitation',
      code: crypto.randomUUID(),
      organizationId: org.organizationId!,
    },
  });
  const klass = await prisma.class.create({
    data: { schoolId: school.id, code: crypto.randomUUID() },
  });
  const email = `legacy-${crypto.randomUUID()}@example.test`;
  const storage = createCookieSessionStorage({
    cookie: {
      name: 'en_invitation',
      secrets: process.env.SESSION_SECRET!.split(','),
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    },
  });
  const invitation = await storage.getSession();
  invitation.set('email', email);
  invitation.set('klassId', klass.id);
  await page.context().addCookies([
    {
      name: 'en_invitation',
      value: (await storage.commitSession(invitation)).split(';')[0]!.slice(
        'en_invitation='.length
      ),
      url: `http://localhost:${process.env.CLASS_STEP_PORT}`,
    },
  ]);
  const response = await page.request.post('/auth/inv/onboard-student', {
    form: {
      name: 'Legacy Student',
      classId: klass.id,
      password: 'password1234',
      confirmPassword: 'password1234',
    },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(403);
});

test('flag OFF keeps the waiting page and does not expose the in-app lock', async ({
  page,
}) => {
  const { user } = await fixture('11', 'SENT');
  await prisma.orgMembership.create({
    data: {
      userId: user.id,
      organizationId: 'default-org',
      role: 'TEACHER',
    },
  });
  await flag(false);
  await login(page, user.email!);
  await page.goto('/app/free-tier/pending');
  await expect(page).toHaveURL(/free-tier\/pending/);
  await expect(page.getByTestId('teaching-access-banner')).toHaveCount(0);
  await expect(page.getByTestId('free-assignment-tiles')).toHaveCount(0);
});
