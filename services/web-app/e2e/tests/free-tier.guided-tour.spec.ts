import type { Page } from '@playwright/test';
import { expect, test } from '../test-setup';
import { setFreeTierFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';

const FREE_TEACHER_EMAIL =
  process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL ?? 'dev.teacher.free@yawp.local';
const FREE_TEACHER_PASSWORD = 'yawp-dev';

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
    await resetTours();
  });

  test.afterAll(async () => {
    await setFreeTierFlag(true);
  });

  test('dashboard welcome card walks through the tour step by step', async ({
    page,
  }) => {
    await logInAsFreeTeacher(page);
    await page.goto('/app');

    const welcome = page.getByRole('dialog', { name: /Welcome to YAWP/i });
    await expect(welcome).toBeVisible();
    await welcome.getByRole('button', { name: 'Take a tour' }).click();
    await expect(welcome).toBeHidden();

    const step = page.getByTestId('guided-tour-step');
    await expect(step).toBeVisible();
    await expect(step).toContainText('Step 1 of');
    await expect(page.getByTestId('guided-tour-spotlight')).toBeVisible();
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
      page.getByRole('dialog', { name: /Welcome to YAWP/i })
    ).toHaveCount(0);
  });

  test('skip dismisses a page tour, and it can be replayed', async ({
    page,
  }) => {
    await logInAsFreeTeacher(page);
    await page.goto('/app/my-classes');

    const welcome = page.getByRole('dialog', {
      name: /Welcome to My Classes/i,
    });
    await expect(welcome).toBeVisible();
    await welcome.getByRole('button', { name: 'Skip' }).click();
    await expect(welcome).toBeHidden();
    await expect.poll(() => tourOutcome('my-classes')).toBe('dismissed');

    await page.reload();
    await expect(
      page.getByRole('dialog', { name: /Welcome to My Classes/i })
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Tour this page' }).click();
    await expect(page.getByTestId('guided-tour-step')).toContainText(
      'Step 1 of'
    );
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('guided-tour-step')).toBeHidden();
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
    await welcome.getByRole('button', { name: 'Take a tour' }).click();
    const step = page.getByTestId('guided-tour-step');
    await expect(step).toContainText('Student join link');
    await expect(page.locator('[data-tour="class-join-link"]')).toHaveAttribute(
      'data-tour-active',
      'true'
    );
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

test('teachers at paid schools never see the free tier tour', async ({
  page,
  signIn,
  e2eContext,
}) => {
  await setFreeTierFlag(true);
  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  await page.goto('/app');
  await expect(page.getByTestId('app._index')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Welcome to/i })).toHaveCount(
    0
  );
  await expect(
    page.getByRole('button', { name: 'Tour this page' })
  ).toHaveCount(0);
});
