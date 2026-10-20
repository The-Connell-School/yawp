import { test, expect, type Page } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';

const db = createE2EPrismaClient();
const org = 'preview-free-classroom';

async function flag(name: string, value: unknown) {
  await db.setting.upsert({
    where: { name: `feature_flag.${name}` },
    create: { name: `feature_flag.${name}`, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
}

async function loginFreeTeacher(page: Page) {
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email or handle').fill('dev.teacher.free@yawp.local');
  await page.locator('input[type="password"]').fill('yawp-dev');
  await page.getByRole('button', { name: /Log in/i }).click();
  await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === '/app');
}

async function loginSchoolTeacher(page: Page) {
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email or handle').fill('dev.teacher@yawp.local');
  await page.locator('input[type="password"]').fill('yawp-dev');
  await page.getByRole('button', { name: /Log in/i }).click();
  await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === '/app');
}

test.beforeEach(async () => {
  await db.freeTierApplication.updateMany({
    where: { organizationId: org },
    data: { status: 'APPROVED' },
  });
});

test.afterAll(async () => {
  await flag('free_tier', false);
  await db.$disconnect();
});

test('free-tier flag on shows locked assignment tiles on dashboard and picker', async ({
  page,
}) => {
  await flag('free_tier', true);
  await flag('free-tier-inapp-v2', true);
  await flag('free-tier-onboarding-v2', { mode: 'targeted', orgIds: [org] });
  await loginFreeTeacher(page);
  await page.goto('/app');
  const tiles = page.getByTestId('free-assignment-tiles');
  await expect(tiles.getByTestId('site-license-locked-assignment-tile')).not.toHaveCount(
    0
  );
  await expect(tiles).toContainText('Available with a site license.');
  await page.getByRole('button', { name: 'New assignment' }).click();
  await expect(
    page.getByTestId('site-license-locked-assignment-tile').first()
  ).toBeVisible();
  await expect(page.getByText('Available with a site license.').first()).toBeVisible();
});

test('free-tier flag off keeps the licensed teacher dashboard unchanged', async ({
  page,
}) => {
  await flag('free_tier', false);
  await flag('free-tier-inapp-v2', false);
  await loginSchoolTeacher(page);
  await page.goto('/app');
  await expect(page.getByTestId('teacher-assignments-grid')).toBeVisible();
  await expect(page.getByTestId('free-assignment-tiles')).toHaveCount(0);
  await expect(page.getByTestId('site-license-locked-assignment-tile')).toHaveCount(
    0
  );
});
