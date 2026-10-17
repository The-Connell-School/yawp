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
  if (status === 'SENT') await prisma.freeTierAdminApproval.create({ data: {
    applicationId: app.id, adminName: 'Dr. Patel', adminEmail: 'principal@example.test',
    emailCopyVersionHash: 'local-locked-preview', firstSentAt: new Date('2026-10-14T15:00:00Z'),
  } });
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
    await expect(page.getByText(/Sent to Dr. Patel on/)).toBeVisible();
    await expect(page.getByText('Not the right person? Forward this request', { exact: true })).toBeVisible();
    await capture(page, `waiting-${width}`);
    await page.getByRole('link', { name: 'Look around while you wait' }).click();
    await expect(page.getByRole('heading', { name: 'Look around while you wait' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create assignment', exact: true })).toBeDisabled();
    await capture(page, `preview-${width}`);
    for (const section of ['Class Starter', 'Pre-writing', 'Thesis', 'Lesson Planner how-to']) {
      await page.getByRole('link', { name: section, exact: true }).click();
      await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
      if (section === 'Class Starter' || section === 'Thesis') {
        await page.locator('details').first().locator('summary').click();
        await expect(page.locator('details[open] p').first()).toBeVisible();
      }
      await capture(page, `${section.toLowerCase().replaceAll(' ', '-')}-${width}`);
    }
    const before = await prisma.assignment.count();
    const reservations = await prisma.aiRequestReservation.count();
    for (const path of ['/api/assignments/create', '/api/domain/reporter', '/api/domain/lesson-planner', '/api/domain/lesson-planner/packet', '/app/assignments', '/app/organization/students']) {
      const response = await page.request.post(path, { form: { intent: 'create', organizationId: 'foreign-org' }, maxRedirects: 0 });
      // A parent route can replace the action denial with its waiting redirect.
      // Both must stay inside the locked flow; the real action is also tested
      // independently against authenticated Requests in the DB profile.
      if (response.status() === 302) {
        expect(response.headers().location, path).toMatch(/^\/app\/free-tier\/(pending|preview)$/);
      } else {
        expect(response.status(), path).toBe(403);
      }
    }
    expect(await prisma.assignment.count()).toBe(before);
    expect(await prisma.aiRequestReservation.count()).toBe(reservations);
    expect((await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } })).organizationId).toBeNull();
    await page.goto('/app/reporter');
    await expect(page).toHaveURL(/free-tier\/preview/);
    await prisma.freeTierApplication.update({ where: { id: app.id }, data: { status: 'APPROVED' } });
    // Model the organization membership that real approval provisions.
    const approvedOrg = await prisma.organization.create({ data: { name: 'Local approved classroom', plan: 'FREE_CLASSROOM' } });
    await prisma.orgMembership.create({ data: { userId: user.id, organizationId: approvedOrg.id, role: 'TEACHER' } });
    await prisma.freeTierApplication.update({ where: { id: app.id }, data: { organizationId: approvedOrg.id } });
    await page.goto('/app/free-tier/preview');
    await expect(page).not.toHaveURL(/free-tier\/preview/);
    await page.goto('/app/assignments');
    await expect(page.getByRole('heading', { name: 'My Assignments', exact: true })).toBeVisible();
    await capture(page, `approved-assignments-${width}`);
  });
}
test('manual review also offers the same read-only preview', async ({ page }) => {
  const { user } = await fixture('11', 'MANUAL_REVIEW');
  await login(page, user.email!);
  await expect(page.getByRole('heading', { name: "We're reviewing your request" })).toBeVisible();
  await page.getByRole('link', { name: 'Look around while you wait' }).click();
  await expect(page.getByRole('heading', { name: 'Look around while you wait' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use Lesson Planner', exact: true })).toBeDisabled();
});
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

for (const width of [1440, 390]) {
  test(`legacy public enrollment cannot bypass pending approval at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { app } = await fixture('11', 'SENT');
    const org = await prisma.organization.create({
      data: { name: 'Local pending classroom', plan: 'FREE_CLASSROOM' },
    });
    await prisma.freeTierApplication.update({
      where: { id: app.id },
      data: { organizationId: org.id },
    });
    const school = await prisma.school.create({
      data: {
        name: 'Local invitation',
        code: crypto.randomUUID(),
        organizationId: org.id,
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
    await page
      .context()
      .addCookies([
        {
          name: 'en_invitation',
          value: (await storage.commitSession(invitation))
            .split(';')[0]!
            .slice('en_invitation='.length),
          url: `http://localhost:${process.env.CLASS_STEP_PORT}`,
        },
      ]);
    await page.goto('/auth/inv/onboard-student');
    await expect(
      page.getByText('Create your account and join your class.')
    ).toBeVisible();
    await capture(page, `legacy-enrollment-form-${width}`);
    const counts = async () =>
      Promise.all([
        prisma.user.count(),
        prisma.orgMembership.count(),
        prisma.session.count(),
        prisma.orgMembership.count({
          where: { classesAsStudent: { some: { id: klass.id } } },
        }),
      ]);
    const before = await counts();
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
    expect(await counts()).toEqual(before);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    await page.getByLabel('Name', { exact: true }).fill('Legacy Student');
    await page.getByLabel('Password', { exact: true }).fill('password1234');
    await page
      .getByLabel('Confirm Password', { exact: true })
      .fill('password1234');
    const denial = page.waitForResponse(
      (response) => response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: /create account/i }).click();
    expect((await denial).status()).toBe(403);
    await expect(
      page.getByRole('heading', {
        name: "Oops! Something didn't work quite right.",
      })
    ).toBeVisible();
    await capture(page, `legacy-enrollment-denied-${width}`);
    expect(await counts()).toEqual(before);
  });
}


for (const width of [1440, 390]) {
  test(`waiting teacher can tour permitted content without teaching access at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { user, app } = await fixture('11', 'SENT');
    const tourFlag = async (enabled: boolean) => prisma.setting.upsert({
      where: { name: 'feature_flag.guided-tours' },
      create: { name: 'feature_flag.guided-tours', value: String(enabled), valueType: 'boolean' },
      update: { value: String(enabled) },
    });
    const before = {
      assignments: await prisma.assignment.count(),
      reservations: await prisma.aiRequestReservation.count(),
      memberships: await prisma.orgMembership.count({ where: { userId: user.id } }),
      emails: await prisma.freeTierEmailLog.count({ where: { applicationId: app.id } }),
    };
    try {
      await tourFlag(false);
      await login(page, user.email!);
      await page.getByRole('link', { name: 'Look around while you wait' }).click();
      await expect(page.getByTestId('guided-tour-welcome')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Tour this page' })).toHaveCount(0);
      await capture(page, `waiting-tour-off-${width}`);
      await tourFlag(true);
      await page.reload();
      await expect(page.getByTestId('guided-tour-welcome')).toBeVisible();
      await capture(page, `waiting-tour-welcome-${width}`);
      await page.getByRole('button', { name: 'Take a tour' }).click();
      await expect(page.getByTestId('guided-tour-step')).toContainText('Explore the preview');
      await capture(page, `waiting-tour-step-${width}`);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByTestId('guided-tour-step')).toContainText('After approval');
      await page.getByRole('button', { name: 'Finish', exact: true }).click();
      await expect.poll(async () => (await prisma.userTour.findUnique({
        where: { userId_tourId: { userId: user.id, tourId: 'waiting-preview' } },
      }))?.status).toBe('completed');
      await page.reload();
      await expect(page.getByTestId('guided-tour-welcome')).toHaveCount(0);
      await page.getByRole('button', { name: 'Tour this page' }).click();
      await expect(page.getByTestId('guided-tour-step')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Create assignment', exact: true })).toBeDisabled();
      for (const form of [{ tourId: 'dashboard', status: 'completed' }, { intent: 'reset' }] as Record<string, string>[])
        expect((await page.request.post('/api/guided-tours', { form })).status()).toBe(403);
      for (const path of ['/api/assignments/create', '/api/domain/reporter', '/api/domain/lesson-planner', '/api/domain/lesson-planner/packet'])
        expect((await page.request.post(path, { form: { intent: 'create' } })).status()).toBe(403);
      expect(await prisma.assignment.count()).toBe(before.assignments);
      expect(await prisma.aiRequestReservation.count()).toBe(before.reservations);
      expect(await prisma.orgMembership.count({ where: { userId: user.id } })).toBe(before.memberships);
      expect(await prisma.freeTierEmailLog.count({ where: { applicationId: app.id } })).toBe(before.emails);
      expect((await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } })).organizationId).toBeNull();
      const storage = createCookieSessionStorage({ cookie: { name: 'en_session', path: '/', secrets: process.env.SESSION_SECRET!.split(',') } });
      const cookie = (await page.context().cookies()).find(c => c.name === 'en_session')!;
      const session = await storage.getSession(`en_session=${cookie.value}`);
      session.set('impersonationMode', 'read-only');
      session.set('impersonatorUserId', 'local-reviewer');
      const signed = await storage.commitSession(session);
      await page.context().addCookies([{ name: 'en_session', value: signed.split(';')[0].slice('en_session='.length), url: new URL(page.url()).origin }]);
      await page.reload();
      await expect(page.getByRole('button', { name: 'Tour this page' })).toHaveCount(0);
      expect((await page.request.post('/api/guided-tours', { form: { tourId: 'waiting-preview', status: 'dismissed' } })).status()).toBe(403);
      await capture(page, `waiting-tour-read-only-${width}`);
    } finally { await tourFlag(false); }
  });
}
