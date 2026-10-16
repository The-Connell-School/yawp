import type { Page } from '@playwright/test';
import { expect, test } from '../test-setup';
import { setFreeTierFlag } from '../feature-flags';

const FREE_TEACHER_EMAIL =
  process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL ?? 'dev.teacher.free@yawp.local';
const FREE_TEACHER_PASSWORD = 'yawp-dev';
const PAID_TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';

const THESIS_TEASER = '/app/assignment-type-previews/thesis-driven-essay';
const AP_HISTORY_TEASER = '/app/assignment-type-previews/ap-history-essay';
const DAILY_PAGES_TEASER = '/app/assignment-type-previews/daily-pages';

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

test.describe.serial('Free tier: locked assignment types', () => {
  test.beforeEach(async () => {
    await setFreeTierFlag(true);
  });

  test.afterAll(async () => {
    await setFreeTierFlag(true);
  });

  test('the dashboard shows paid types grayed out after the free ones', async ({
    page,
  }) => {
    await logInAsFreeTeacher(page);
    await page.goto('/app');

    const grid = page.getByTestId('teacher-assignments-grid');
    const unlocked = await grid
      .locator('[data-locked="false"] h3')
      .allTextContents();
    expect(unlocked.map((title) => title.trim()).sort()).toEqual([
      'Class Starter',
      'Prewriting',
      'Thesis Statement',
    ]);

    const locked = grid.locator('[data-locked="true"]');
    await expect(locked).toHaveCount(3);
    await expect(locked.nth(0)).toContainText('The Thesis-Driven Essay');
    await expect(locked.nth(1)).toContainText('AP History Essay');
    await expect(locked.nth(2)).toContainText('Daily Pages');
    // Daily Pages keeps the card art it has on a paid school's dashboard.
    await expect(locked.nth(2).locator('img')).toHaveAttribute(
      'src',
      '/img/daily-pages-guide/card.jpg'
    );
    // A locked tile can't make an assignment, so it has no + button.
    await expect(
      grid.getByRole('button', { name: /New The Thesis-Driven Essay/ })
    ).toHaveCount(0);

    // Locked tiles come after every free tile.
    const order = await grid
      .locator('[data-locked]')
      .evaluateAll((tiles) =>
        tiles.map((tile) => tile.getAttribute('data-locked'))
      );
    expect(order.indexOf('true')).toBeGreaterThan(order.lastIndexOf('false'));
  });

  test('a locked tile opens that type’s guide as a teaser', async ({
    page,
  }) => {
    await logInAsFreeTeacher(page);
    await page.goto('/app');

    await page
      .getByRole('link', {
        name: /The Thesis-Driven Essay, included with a paid plan/,
      })
      .click();
    await expect(page).toHaveURL(new RegExp(`${THESIS_TEASER}$`));

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /teach the thesis-driven essay/i,
      })
    ).toBeVisible();
    await expect(page.getByTestId('locked-type-banner')).toContainText(
      /included with a paid plan/i
    );
    await expect(page.getByTestId('guide-wont')).toContainText(
      /write the essay for a student/i
    );
    await expect(page.locator('video source').first()).toHaveAttribute(
      'src',
      /^\/img\/thesis-essay-guide\/.+\.mp4$/
    );
    // A free teacher can't start it, so the guide never offers to.
    await expect(
      page.getByRole('link', { name: 'Create an assignment' })
    ).toHaveCount(0);

    await page.getByRole('link', { name: 'Back to dashboard' }).first().click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test('the AP History teaser shows its own guide', async ({ page }) => {
    await logInAsFreeTeacher(page);
    await page.goto('/app');
    await page
      .getByRole('link', {
        name: /AP History Essay, included with a paid plan/,
      })
      .click();
    await expect(page).toHaveURL(new RegExp(`${AP_HISTORY_TEASER}$`));

    await expect(
      page.getByRole('heading', { level: 1, name: /AP History essay/i })
    ).toBeVisible();
    await expect(page.getByTestId('locked-type-banner')).toBeVisible();
    await expect(page.getByTestId('guide-wont')).toContainText(
      /write the essay for a student/i
    );
    await expect(page.locator('video source').first()).toHaveAttribute(
      'src',
      /^\/img\/ap-history-guide\/.+\.mp4$/
    );
  });

  test('the Daily Pages teaser shows its own guide', async ({ page }) => {
    await logInAsFreeTeacher(page);
    await page.goto('/app');
    await page
      .getByRole('link', { name: /Daily Pages, included with a paid plan/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`${DAILY_PAGES_TEASER}$`));

    await expect(
      page.getByRole('heading', { level: 1, name: /daily writing/i })
    ).toBeVisible();
    await expect(page.getByTestId('locked-type-banner')).toBeVisible();
    await expect(page.getByTestId('guide-wont')).toContainText(
      /grammar/i
    );
    await expect(page.locator('video source').first()).toHaveAttribute(
      'src',
      /^\/img\/daily-pages-guide\/.+\.mp4$/
    );
    await expect(
      page.getByRole('link', { name: 'Create an assignment' })
    ).toHaveCount(0);
  });

  test('an unknown teaser is not found', async ({ page }) => {
    await logInAsFreeTeacher(page);
    const response = await page.goto(
      '/app/assignment-type-previews/no-such-type'
    );
    expect(response?.status()).toBe(404);
  });

  test('teasers stay in bounds on a phone', async ({ page }) => {
    await logInAsFreeTeacher(page);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of [
      THESIS_TEASER,
      AP_HISTORY_TEASER,
      DAILY_PAGES_TEASER,
    ]) {
      await page.goto(path);
      await expect(page.getByTestId('guide-wont')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });

  test('with the flag off, there are no locked tiles and no teasers', async ({
    page,
  }) => {
    await logInAsFreeTeacher(page);
    await setFreeTierFlag(false);
    await page.goto('/app');
    await expect(page.getByTestId('teacher-assignments-grid')).toBeVisible();
    await expect(page.locator('[data-locked="true"]')).toHaveCount(0);
    const response = await page.goto(THESIS_TEASER);
    expect(response?.status()).toBe(404);
  });
});

test('paid teachers see no locked tiles and no teasers', async ({
  page,
  signIn,
  e2eContext,
}) => {
  await setFreeTierFlag(true);
  await signIn(e2eContext.teacherEmail, PAID_TEACHER_PASSWORD);
  await page.goto('/app');
  await expect(page.getByTestId('teacher-assignments-grid')).toBeVisible();
  await expect(page.locator('[data-locked="true"]')).toHaveCount(0);
  const response = await page.goto(THESIS_TEASER);
  expect(response?.status()).toBe(404);
});

test('students get no teasers', async ({ page, signIn, e2eContext }) => {
  await setFreeTierFlag(true);
  await signIn(e2eContext.userEmail, STUDENT_PASSWORD);
  const response = await page.goto(THESIS_TEASER);
  expect(response?.status()).toBe(404);
});
