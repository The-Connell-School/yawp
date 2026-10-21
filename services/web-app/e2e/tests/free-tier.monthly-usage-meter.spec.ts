import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';

const shots = process.env.FTO_METER_SHOTS;
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

async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: join(shots, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

async function seedLessonPlannerUsage(used: number, cap: number) {
  const prefix = `free_tier.monthly.v1:${org}:lesson-planner:`;
  await db.setting.deleteMany({ where: { name: { startsWith: prefix } } });
  const period = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
  ).toISOString();
  for (let i = 0; i < used; i++) {
    await db.setting.create({
      data: {
        name: `${prefix}seed-${i}-${Date.now()}`,
        value: JSON.stringify({
          period,
          fingerprint: `seed-${i}`,
          status: 'completed',
          token: `seed-${i}`,
          expiresAt: new Date().toISOString(),
        }),
        valueType: 'json',
      },
    });
  }
  await db.setting.upsert({
    where: { name: 'free_tier.limits.v1' },
    create: {
      name: 'free_tier.limits.v1',
      value: JSON.stringify({
        studentSeatCap: 35,
        lessonPlannerMonthly: cap,
        reporterMonthly: 2,
        version: 1,
        updatedAt: new Date().toISOString(),
        updatedByEmail: 'staff@yawp.school',
      }),
      valueType: 'json',
    },
    update: {
      value: JSON.stringify({
        studentSeatCap: 35,
        lessonPlannerMonthly: cap,
        reporterMonthly: 2,
        version: 1,
        updatedAt: new Date().toISOString(),
        updatedByEmail: 'staff@yawp.school',
      }),
    },
  });
}

test.beforeEach(async () => {
  await db.freeTierApplication.updateMany({
    where: { organizationId: org },
    data: { status: 'APPROVED' },
  });
  await flag('free-tier', { mode: 'targeted', orgIds: [org] });
  await flag('lesson_planner', true);
});

test.afterAll(async () => {
  await db.$disconnect();
});

for (const [used, cap, tag] of [
  [0, 5, 'meter-0'],
  [3, 5, 'meter-60'],
  [9, 10, 'meter-90'],
  [5, 5, 'meter-100'],
] as const) {
  for (const [width, label] of [
    [1440, 'desktop'],
    [390, 'mobile'],
  ] as const) {
    test(`${tag} ${label}`, async ({ page }) => {
      test.skip(!shots, 'Set FTO_METER_SHOTS to capture evidence');
      await seedLessonPlannerUsage(used, cap);
      await login(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/app');
      await expect(page.getByTestId('monthly-usage-card')).toBeVisible();
      await shot(page, `${tag}-${label}`);
      if (tag === 'meter-100') {
        await page.goto('/app/lesson-planner');
        await expect(
          page.getByTestId('lesson-planner-monthly-limit')
        ).toBeVisible();
        await shot(page, `lp-limit-${label}`);
      }
      if (tag === 'meter-0') {
        await expect(page.getByTestId('free-assignment-tiles')).toContainText(
          'Unlimited'
        );
        await shot(page, `tiles-unlimited-${label}`);
      }
    });
  }
}
