import { createCookieSessionStorage } from 'react-router';
import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from '../test-setup';
import { setFreeTierFlag, setFeatureFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';

const FREE_TEACHER_EMAIL =
  process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL ?? 'dev.teacher.free@yawp.local';
const FREE_TEACHER_PASSWORD = 'yawp-dev';
const tourWrites: Record<string, string>[] = [{ tourId: 'dashboard', status: 'completed' }, { intent: 'reset' }];
const shots = process.env.GUIDED_TOURS_SHOTS;
async function shot(page: Page, name: string) {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}-impl.png`, animations: 'disabled' });
}

async function capturePair(page: Page, name: string) {
  if (!shots) return;
  await setFeatureFlag('guided-tours', false);
  await page.reload();
  await expect(page.getByTestId('guided-tour-welcome')).toHaveCount(0);
  await shot(page, `${name}-before`);
  await setFeatureFlag('guided-tours', true);
  await page.reload();
  await expect(page.getByTestId('guided-tour-welcome')).toBeVisible();
  await shot(page, name);
}

// seed-e2e marks every tour finished for the free teacher so other specs never
// see a welcome card. These tests clear that first.
async function resetTours() {
  const prisma = createE2EPrismaClient();
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: FREE_TEACHER_EMAIL },
      select: { id: true },
    });
    await prisma.userTour.deleteMany({ where: { userId: user.id } });
  } finally {
    await prisma.$disconnect();
  }
}

async function tourOutcome(tourId: string) {
  const prisma = createE2EPrismaClient();
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: FREE_TEACHER_EMAIL },
      select: { id: true },
    });
    const row = await prisma.userTour.findUnique({
      where: { userId_tourId: { userId: user.id, tourId } },
      select: { status: true },
    });
    return row?.status ?? null;
  } finally {
    await prisma.$disconnect();
  }
}

async function logInAsFreeTeacher(page: Page) {
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email or handle').fill(FREE_TEACHER_EMAIL);
  await page.locator('input[type="password"]').fill(FREE_TEACHER_PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/app'), {
    timeout: 15000,
  });
}

test.describe.serial('Free tier guided tour', () => {
  test.beforeEach(async () => {
    await setFreeTierFlag(true);
    await setFeatureFlag('guided-tours', true);
    await resetTours();
  });

  test.afterAll(async () => {
    await setFeatureFlag('guided-tours', false);
    await setFreeTierFlag(true);
  });

  for (const width of [1280, 390]) {
    test(`onboarding keeps tours hidden until approval at ${width}px`, async ({ page }) => {
      const prisma = createE2EPrismaClient();
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: FREE_TEACHER_EMAIL },
        include: { memberships: { include: { organization: true } } },
      });
      const organizationId = user.memberships.find(
        membership => membership.organization.plan === 'FREE_CLASSROOM'
      )!.organizationId;
      const original = await prisma.freeTierApplication.findUnique({
        where: { email: FREE_TEACHER_EMAIL },
      });
      const application = await prisma.freeTierApplication.upsert({
        where: { email: FREE_TEACHER_EMAIL },
        create: {
          email: FREE_TEACHER_EMAIL, userId: user.id,
          name: 'Local tour teacher', schoolName: 'Local tour fixture',
          location: 'Local', gradeLevel: '11', status: 'ACCOUNT_CREATED',
        },
        update: { status: 'ACCOUNT_CREATED', organizationId: null, starterClassName: null, starterClassGrade: null },
      });
      const emailCount = await prisma.freeTierEmailLog.count({ where: { applicationId: application.id } });
      try {
        await setFeatureFlag('free-tier-onboarding-v2', true);
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await logInAsFreeTeacher(page);
        await page.goto('/app');
        await expect(page).toHaveURL(/\/app\/free-tier\/onboarding$/);
        await expect(page.getByRole('heading', { name: 'Let’s set up your classroom' })).toBeVisible();
        await expect(page.getByTestId('guided-tour-welcome')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Tour this page' })).toHaveCount(0);
        await expect(page.locator('[aria-current="step"]')).toContainText('Set up your class');
        await shot(page, `onboarding-${width}-class`);
        await page.getByLabel('Class name').fill('AP English 11');
        await page.getByLabel('Grade').selectOption('11');
        await page.getByRole('button', { name: 'Create my class', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'One last step: your administrator’s approval' })).toBeVisible();
        await expect(page.getByTestId('guided-tour-welcome')).toHaveCount(0);
        await shot(page, `onboarding-${width}-administrator`);
        expect(await tourOutcome('dashboard')).toBeNull();
        expect(await prisma.freeTierEmailLog.count({ where: { applicationId: application.id } })).toBe(emailCount);

        // Approval is a local fixture transition; no approval request is sent.
        await prisma.freeTierApplication.update({
          where: { id: application.id }, data: { status: 'APPROVED', organizationId },
        });
        await page.goto('/app');
        await expect(page.getByTestId('guided-tour-welcome')).toBeVisible();
        await shot(page, `onboarding-${width}-approved-tour`);
      } finally {
        if (original) {
          await prisma.freeTierApplication.update({
            where: { id: original.id },
            data: {
              status: original.status,
              organizationId: original.organizationId,
              starterClassName: original.starterClassName,
              starterClassGrade: original.starterClassGrade,
            },
          });
        } else {
          await prisma.freeTierApplication.delete({ where: { id: application.id } });
        }
        await setFeatureFlag('free-tier-onboarding-v2', false);
        await prisma.$disconnect();
      }
    });
  }

  test('dashboard welcome card walks through the tour step by step', async ({
    page,
  }) => {
    await logInAsFreeTeacher(page);
    await page.goto('/app');

    const welcome = page.getByRole('dialog', { name: /Welcome to Yawp!/i });
    await expect(welcome).toBeVisible();
    await capturePair(page, 'welcome');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, 'welcome-mobile');
    await page.setViewportSize({ width: 1280, height: 720 });
    await welcome.getByRole('button', { name: 'Take a tour' }).click();
    await expect(welcome).toBeHidden();

    const step = page.getByTestId('guided-tour-step');
    await expect(step).toBeVisible();
    await expect(step).toContainText('Step 1 of');
    await expect(page.getByTestId('guided-tour-spotlight')).toBeVisible();
    await shot(page, 'spotlight');
    // The first step points at the class card section.
    await expect(
      page.locator('[data-tour="dashboard-classes"]')
    ).toHaveAttribute('data-tour-active', 'true');

    await step.getByRole('button', { name: 'Next' }).click();
    await expect(step).toContainText('Step 2 of');
    await step.getByRole('button', { name: 'Previous step' }).click();
    await expect(step).toContainText('Step 1 of');

    // Walk to the end; the last button finishes the tour.
    for (let i = 0; i < 10; i++) {
      const finish = step.getByRole('button', { name: 'Finish' });
      if (await finish.isVisible()) {
        await finish.click();
        break;
      }
      await step.getByRole('button', { name: 'Next' }).click();
    }
    await expect(step).toBeHidden();
    await expect(page.getByTestId('guided-tour-spotlight')).toBeHidden();
    await expect.poll(() => tourOutcome('dashboard')).toBe('completed');

    // Finished tours stay finished on the next visit.
    await page.reload();
    await expect(
      page.getByRole('dialog', { name: /Welcome to Yawp!/i })
    ).toHaveCount(0);
  });

  test('skip hides a page tour for this session, and it can be replayed', async ({
    page,
    browser,
  }) => {
    await logInAsFreeTeacher(page);
    await page.goto('/app/my-classes');

    const welcome = page.getByRole('dialog', {
      name: /Welcome to My Classes/i,
    });
    await expect(welcome).toBeVisible();
    await capturePair(page, 'my-classes');
    await welcome.getByRole('button', { name: 'Skip' }).click();
    await expect(welcome).toBeHidden();
    await expect.poll(() => tourOutcome('my-classes')).toBe('dismissed');

    await page.reload();
    await expect(
      page.getByRole('dialog', { name: /Welcome to My Classes/i })
    ).toHaveCount(0);

    await shot(page, 'page-replay-control');
    await page.getByRole('button', { name: 'Tour this page' }).click();
    await expect(page.getByTestId('guided-tour-step')).toContainText(
      'Step 1 of'
    );
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('guided-tour-step')).toBeHidden();

    // Skipping is not finishing: the next time they log in, it greets them again.
    const nextLogin = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    });
    const nextPage = await nextLogin.newPage();
    try {
      await logInAsFreeTeacher(nextPage);
      await expect(
        nextPage.getByRole('dialog', { name: /Welcome to Yawp!/i })
      ).toBeVisible();
      await nextPage.goto('/app/my-classes');
      await expect(
        nextPage.getByRole('dialog', { name: /Welcome to My Classes/i })
      ).toBeVisible();
    } finally {
      await nextLogin.close();
    }
  });

  test('skipped welcome returns after signing out and signing in in the same tab', async ({ page }) => {
    await logInAsFreeTeacher(page);
    const welcome = page.getByTestId('guided-tour-welcome');
    await expect(welcome).toBeVisible();
    await welcome.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect.poll(() => tourOutcome('dashboard')).toBe('dismissed');
    await page.request.post('/auth/logout');
    await logInAsFreeTeacher(page);
    await expect(welcome).toBeVisible();
  });

  test('class page tour points at the student join link', async ({ page }) => {
    await logInAsFreeTeacher(page);
    await page.goto('/app/my-classes');
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.locator('a[href^="/app/my-classes/"]').first().click();
    await page.waitForURL(/\/app\/my-classes\/[^/]+$/);

    const welcome = page.getByRole('dialog', {
      name: /Welcome to your class/i,
    });
    await expect(welcome).toBeVisible();
    await capturePair(page, 'class');
    await welcome.getByRole('button', { name: 'Take a tour' }).click();
    const step = page.getByTestId('guided-tour-step');
    await expect(step).toContainText('Student join link');
    await expect(page.locator('[data-tour="class-join-link"]')).toHaveAttribute(
      'data-tour-active',
      'true'
    );
  });

  for (const { path, welcome } of [
    { path: '/app/assignments', welcome: /Welcome to My Assignments/i },
    { path: '/app/documents', welcome: /Welcome to Documents/i },
    { path: '/app/writing-lessons', welcome: /Welcome to Writing Practice/i },
    {
      path: '/app/teacher-trainings',
      welcome: /Welcome to the Teacher's Lounge/i,
    },
    { path: '/app/lesson-planner', welcome: /Welcome to the Lesson Planner/i },
    { path: '/app/organization/classes', welcome: /Welcome to Organization/i },
  ]) {
    test(`${path} has its own tour`, async ({ page }) => {
      await logInAsFreeTeacher(page);
      await page.goto(path);

      const card = page.getByRole('dialog', { name: welcome });
      await expect(card).toBeVisible();
      await capturePair(page, path.replace('/app/', '').replaceAll('/', '-'));
      await card.getByRole('button', { name: 'Take a tour' }).click();

      const step = page.getByTestId('guided-tour-step');
      await expect(step).toContainText('Step 1 of');
      // The first step points at something real on the page, not a
      // centered fallback card.
      await expect(page.locator('[data-tour-active="true"]')).toHaveCount(1);
      await expect(page.getByTestId('guided-tour-spotlight')).toBeVisible();
      if (path === '/app/organization/classes') {
        await shot(page, 'organization-step-desktop');
        await page.setViewportSize({ width: 390, height: 844 });
        await shot(page, 'organization-step-mobile');
        await expect(step.getByRole('heading', { name: 'Your organization', exact: true })).toBeVisible();
      }
      await page.keyboard.press('Escape');
      await expect(step).toBeHidden();
    });
  }

  for (const type of ['Class Starter', 'Prewriting', 'Thesis Statement']) {
    test(`clicking into ${type} shows that type's tour`, async ({ page }) => {
      await logInAsFreeTeacher(page);
      await page.goto('/app');
      await page.getByRole('button', { name: 'Skip' }).click();
      await page
        .getByTestId('teacher-assignments-grid')
        .getByText(type, { exact: true })
        .first()
        .click();
      await page.waitForURL(/\/app\/assignment-types\/[^/]+$/);

      const card = page.getByRole('dialog', {
        name: new RegExp(`Welcome to ${type}`, 'i'),
      });
      await expect(card).toBeVisible();
      await capturePair(page, `type-${type.toLowerCase().replaceAll(' ', '-')}`);
      await card.getByRole('button', { name: 'Take a tour' }).click();

      // The first step is how to create one: the New menu.
      const step = page.getByTestId('guided-tour-step');
      await expect(step).toContainText('Step 1 of');
      await expect(page.locator('[data-tour="type-new"]')).toHaveAttribute(
        'data-tour-active',
        'true'
      );
      // Closing partway through is not skipping: the welcome card comes back.
      await page.keyboard.press('Escape');
      await expect(step).toBeHidden();
      await page.reload();
      await expect(card).toBeVisible();
      expect(
        await tourOutcome(`type-${type.toLowerCase().replace(' ', '-')}`)
      ).toBeNull();
    });
  }

  test('opening a document for the first time shows the writing page tour', async ({
    page,
  }) => {
    await logInAsFreeTeacher(page);
    await page.goto('/app');
    await page.getByRole('button', { name: 'Skip' }).click();
    await page
      .getByTestId('teacher-assignments-grid')
      .getByText('Class Starter', { exact: true })
      .first()
      .click();
    await page.waitForURL(/\/app\/assignment-types\/[^/]+$/);
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Document' }).click();
    await page.waitForURL(/\/app\/documents\/[^/?]+/);

    const card = page.getByRole('dialog', {
      name: /Welcome to the writing page/i,
    });
    await expect(card).toBeVisible();
    await capturePair(page, 'document');
    await card.getByRole('button', { name: 'Take a tour' }).click();
    const step = page.getByTestId('guided-tour-step');
    await expect(step).toContainText('Step 1 of');
    await expect(page.locator('[data-tour-active="true"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('document-actions-menu')).toBeFocused();

    // The page has no sidebar, so its menu offers the tour again.
    await page.getByTestId('document-actions-menu').click();
    await page.getByRole('menuitem', { name: 'Tour this page' }).click();
    await expect(step).toContainText('Step 1 of');
  });

  test('Restart all tours brings every welcome card back', async ({ page }) => {
    await logInAsFreeTeacher(page);
    await page.goto('/app');
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect.poll(() => tourOutcome('dashboard')).toBe('dismissed');
    await page.reload();
    await expect(
      page.getByRole('dialog', { name: /Welcome to Yawp!/i })
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Settings' }).click();
    await shot(page, 'restart-control');
    await page.getByRole('button', { name: 'Restart all tours' }).click();

    await expect(
      page.getByRole('dialog', { name: /Welcome to Yawp!/i })
    ).toBeVisible();
    await expect.poll(() => tourOutcome('dashboard')).toBeNull();
    await shot(page, 'restart-welcome');
  });

  test('the independent tour flag hides controls and rejects forged writes', async ({ page }) => {
    await logInAsFreeTeacher(page);
    await setFeatureFlag('guided-tours', false);
    await page.goto('/app');
    await expect(page.getByTestId('guided-tour-welcome')).toHaveCount(0);
    await shot(page, 'flag-off-before');
    await expect(page.getByRole('button', { name: 'Tour this page' })).toHaveCount(0);
    for (const form of tourWrites) {
      const response = await page.request.post('/api/guided-tours', { form });
      expect(response.status()).toBe(404);
    }
    expect(await tourOutcome('dashboard')).toBeNull();
  });

  test('keyboard focus returns to replay control and reduced motion disables animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await logInAsFreeTeacher(page);
    await page.goto('/app');
    const welcome = page.getByTestId('guided-tour-welcome');
    await expect(welcome).toBeVisible();
    expect(await welcome.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await welcome.getByRole('button', { name: 'Skip', exact: true }).click();
    const replay = page.getByRole('button', { name: 'Tour this page', exact: true });
    await replay.focus();
    await page.keyboard.press('Enter');
    const step = page.getByTestId('guided-tour-step');
    await expect(step.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(step.getByRole('button', { name: 'Close tour' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(step).toBeHidden();
    await expect(replay).toBeFocused();
  });

  test('read-only impersonation hides controls and rejects completion and reset', async ({ page, context }) => {
    await logInAsFreeTeacher(page);
    const storage = createCookieSessionStorage({ cookie: { name: 'en_session', path: '/', secrets: process.env.SESSION_SECRET!.split(',') } });
    const cookie = (await context.cookies()).find(c => c.name === 'en_session')!;
    const session = await storage.getSession(`en_session=${cookie.value}`);
    session.set('impersonationMode', 'read-only');
    session.set('impersonatorUserId', 'local-reviewer');
    const signed = await storage.commitSession(session);
    await context.addCookies([{ name: 'en_session', value: signed.split(';')[0].slice('en_session='.length), url: new URL(page.url()).origin }]);
    await page.goto('/app');
    await expect(page.getByTestId('guided-tour-welcome')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tour this page' })).toHaveCount(0);
    for (const form of tourWrites) {
      expect((await page.request.post('/api/guided-tours', { form })).status()).toBe(403);
    }
    expect(await tourOutcome('dashboard')).toBeNull();
  });

  test('no tour when the free_tier flag is off', async ({ page }) => {
    await logInAsFreeTeacher(page);
    await setFreeTierFlag(false);
    await page.goto('/app');
    await expect(page.getByRole('dialog', { name: /Welcome to/i })).toHaveCount(
      0
    );
    await expect(
      page.getByRole('button', { name: 'Tour this page' })
    ).toHaveCount(0);
  });
});

test('teachers at paid accounts never see the free tier tour', async ({
  page,
  signIn,
  e2eContext,
}) => {
  await setFreeTierFlag(true);
  await setFeatureFlag('guided-tours', true);
  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  await page.goto('/app');
  await expect(page.getByTestId('app._index')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Welcome to/i })).toHaveCount(
    0
  );
  await expect(
    page.getByRole('button', { name: 'Tour this page' })
  ).toHaveCount(0);
  for (const form of tourWrites) {
    expect((await page.request.post('/api/guided-tours', { form })).status()).toBe(404);
  }
  await setFeatureFlag('guided-tours', false);
});

test('students never receive teacher tours or persistence even with both gates on', async ({ page, signIn, e2eContext }) => {
  await setFreeTierFlag(true);
  await setFeatureFlag('guided-tours', true);
  try {
    await signIn('dev.student.free@yawp.local', 'yawp-dev');
    await page.goto('/app');
    await expect(page.getByTestId('guided-tour-welcome')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tour this page' })).toHaveCount(0);
    for (const form of tourWrites) {
      expect((await page.request.post('/api/guided-tours', { form })).status()).toBe(404);
    }
  } finally { await setFeatureFlag('guided-tours', false); }
});
