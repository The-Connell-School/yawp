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

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.getByLabel('Email or handle').fill('dev.teacher.free@yawp.local');
  await page.locator('input[type="password"]').fill('yawp-dev');
  await page.getByRole('button', { name: /Log in/i }).click();
  await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === '/app');
}

test.beforeEach(async () => {
  await flag('free-tier', { mode: 'targeted', orgIds: [org] });
  await flag('lesson_planner', true);
  await db.freeTierApplication.updateMany({
    where: { organizationId: org },
    data: { status: 'APPROVED' },
  });
});

test.afterAll(async () => {
  await db.$disconnect();
});

test('sidebar shows Lesson Planner and Reporter usage rings', async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/lesson-planner');
  await expect(page.getByTestId('usage-nav-ring-lesson-planner')).toBeVisible();
  await page.goto('/app/reporter');
  await expect(page.getByTestId('usage-nav-ring-reporter')).toBeVisible();
});

test('collapsed sidebar link exposes 44px target and popover on focus', async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app');
  await page
    .getByRole('button', { name: 'Collapse app navigation' })
    .click();
  const lp = page.getByTestId('usage-nav-collapsed-link-lesson-planner');
  await expect(lp).toBeVisible();
  const box = await lp.boundingBox();
  expect(box?.width).toBe(44);
  expect(box?.height).toBe(44);
  await lp.focus();
  await expect(page.getByTestId('usage-nav-popover-lesson-planner')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('usage-nav-talk-to-us')).toBeFocused();
});

test('mobile drawer ring opens usage sheet and Close returns focus', async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Open app navigation' }).click();
  const ring = page.getByTestId('usage-nav-ring-lesson-planner');
  await expect(ring).toBeVisible();
  const hit = await ring.boundingBox();
  expect(hit?.width).toBe(44);
  expect(hit?.height).toBe(44);
  await ring.click();
  await expect(
    page.getByTestId('usage-nav-mobile-sheet-lesson-planner')
  ).toBeVisible();
  await page.getByTestId('usage-nav-sheet-close').click();
  await expect(
    page.getByTestId('usage-nav-mobile-sheet-lesson-planner')
  ).toHaveCount(0);
  await expect(ring).toBeFocused();
});
