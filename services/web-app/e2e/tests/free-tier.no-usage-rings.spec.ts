import { test, expect } from '@playwright/test';
import { setFreeTierFlag, setLessonPlannerFlag } from '../feature-flags';
import { submitUnifiedLogin } from '../helpers/unified-login';

async function login(page: import('@playwright/test').Page) {
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await submitUnifiedLogin(page, 'dev.teacher.free@yawp.local', 'yawp-dev');
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
