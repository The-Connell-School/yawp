import { createCookieSessionStorage } from 'react-router';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import { waitForFreeTierEmailPayload } from '../helpers/free-tier-email';

// Dedicated worktree database; no hosted environments or delivered email.
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
const flagName = 'feature_flag.free-tier-onboarding-v2';
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
for (const width of [1440, 390]) {
  test(`waiting preview is read-only at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { user, app } = await fixture('11', 'SENT');
    await login(page, user.email!);
    await expect(page).toHaveURL(/free-tier\/pending/);
    await capture(page, `waiting-${width}`);
    await page.getByRole('link', { name: 'Look around while you wait' }).click();
    await expect(page.getByRole('heading', { name: 'Look around while you wait' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create assignment', exact: true })).toBeDisabled();
    await capture(page, `preview-${width}`);
    for (const section of ['Class Starter', 'Pre-writing', 'Thesis', 'Lesson Planner how-to']) {
      await page.getByRole('link', { name: section, exact: true }).click();
      await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
      await capture(page, `${section.toLowerCase().replaceAll(' ', '-')}-${width}`);
    }
    const before = await prisma.assignment.count();
    const reservations = await prisma.aiRequestReservation.count();
    for (const path of ['/api/assignments/create', '/api/domain/reporter', '/api/domain/lesson-planner', '/api/domain/lesson-planner/packet', '/app/assignments', '/app/organization/students']) {
      const response = await page.request.post(path, { form: { intent: 'create', organizationId: 'foreign-org' }, maxRedirects: 0 });
      expect(response.status(), path).toBe(403);
    }
    expect(await prisma.assignment.count()).toBe(before);
    expect(await prisma.aiRequestReservation.count()).toBe(reservations);
    expect((await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } })).organizationId).toBeNull();
    await page.goto('/app/reporter');
    await expect(page).toHaveURL(/free-tier\/preview/);
    await prisma.freeTierApplication.update({ where: { id: app.id }, data: { status: 'APPROVED' } });
    // Approval removes the preview lock; keep provisioning outside this test.
    await page.goto('/app/free-tier/preview');
    await expect(page).not.toHaveURL(/free-tier\/preview/);
  });
}
test('anonymous users cannot read preview content', async ({ page }) => {
  await page.goto('/app/free-tier/preview');
  await expect(page).toHaveURL(/auth\/login/);
  await expect(page.getByRole('heading', { name: 'Look around while you wait' })).toHaveCount(0);
});
test('flag OFF keeps waiting flow and does not expose the preview', async ({ page }) => {
  const { user } = await fixture('11', 'SENT');
  await flag(false);
  await login(page, user.email!);
  await expect(page).toHaveURL(/free-tier\/pending/);
  await expect(page.getByRole('link', { name: 'Look around while you wait' })).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, `waiting-before-${width}`);
  }
  await page.goto('/app/free-tier/preview');
  await expect(page).not.toHaveURL(/free-tier\/preview/);
});
