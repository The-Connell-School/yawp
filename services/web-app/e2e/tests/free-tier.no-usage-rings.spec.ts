import { test, expect } from '@playwright/test';
import { setFreeTierFlag, setLessonPlannerFlag } from '../feature-flags';

async function login(page: import('@playwright/test').Page) {
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email or handle').fill('dev.teacher.free@yawp.local');
  await page.locator('input[type="password"]').fill('yawp-dev');
  await page.getByRole('button', { name: /Log in/i }).click();
  await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === '/app');
}

test.beforeAll(async () => {
  await setFreeTierFlag(true);
  await setLessonPlannerFlag(true);
});

test('sidebar has no Lesson Planner or Reporter usage rings', async ({
  page,
}) => {
  await login(page);
  await page.goto('/app/lesson-planner');
  await expect(page.getByTestId('usage-nav-ring-lesson-planner')).toHaveCount(0);
  await expect(page.getByTestId('usage-nav-ring-reporter')).toHaveCount(0);
  await expect(
    page.getByTestId('usage-nav-collapsed-link-lesson-planner')
  ).toHaveCount(0);
});
