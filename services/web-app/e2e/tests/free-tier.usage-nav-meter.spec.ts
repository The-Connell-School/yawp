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
