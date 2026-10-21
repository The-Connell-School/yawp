import { createCookieSessionStorage } from 'react-router';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
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
  const { provisionFreeClassroom } =
    await import('~/domain/free-tier/provision-free-classroom.server');
  await provisionFreeClassroom(appId);
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

for (const width of [1440, 390]) {
  test(`waiting teacher explores the real app in locked mode at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { user, app } = await fixture('11', 'SENT');
    await provisionPendingClassroom(app.id, user.id!);
    await login(page, user.email!);
    await page.goto('/app/free-tier/pending');
    await expect(page).toHaveURL(/\/app\/free-tier\/pending$/);
    await page.getByRole('link', { name: 'Explore my classroom' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId('teaching-access-banner')).toBeVisible();
    await expect(
      page.getByText(/Waiting for Dr\. Patel to approve your classroom/)
    ).toBeVisible();
    await capture(page, `locked-app-before-${width}`);
    await page
      .getByRole('button', { name: /New .* assignment/i })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'New assignment' })).toBeVisible();
    await capture(page, `locked-picker-${width}`);
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
    await page.goto('/app/assignments');
    await expect(page.getByRole('heading', { name: 'My Assignments', exact: true })).toBeVisible();
    await capture(page, `approved-assignments-${width}`);
  });
}

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
  await flag(false);
  await login(page, user.email!);
  await page.goto('/app/free-tier/onboarding');
  await expect(page).toHaveURL(/free-tier\/pending/);
});
