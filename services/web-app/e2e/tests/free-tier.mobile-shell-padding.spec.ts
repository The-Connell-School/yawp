import { test, expect } from '@playwright/test';
import { setFreeTierFlag } from '../feature-flags';

async function loginFreeTeacher(page: import('@playwright/test').Page) {
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.getByLabel('Email or handle').fill('dev.teacher.free@yawp.local');
  await page.locator('input[type="password"]').fill('yawp-dev');
  await page.getByRole('button', { name: /Log in/i }).click();
  await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === '/app', {
    timeout: 15000,
  });
}

async function expectBalancedShellInset(
  page: import('@playwright/test').Page,
  shellSelector: string
) {
  const shell = page.locator(shellSelector).first();
  await expect(shell).toBeVisible();
  const box = await shell.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  const leftInset = box!.x;
  const rightInset = viewport!.width - (box!.x + box!.width);
  expect(Math.abs(leftInset - rightInset)).toBeLessThan(3);
}

test.describe('Mobile app shell horizontal padding', () => {
  test.beforeEach(async () => {
    await setFreeTierFlag(true);
  });

  test('My Classes and Home use equal left/right shell inset at 390px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginFreeTeacher(page);

    await page.goto('/app/my-classes');
    await page.waitForLoadState('networkidle');
    await expectBalancedShellInset(page, '.free-tier-b2-page-shell');

    await page.goto('/app');
    await page.waitForLoadState('networkidle');
    await expectBalancedShellInset(page, '.free-tier-b2-page-shell');
  });
});
