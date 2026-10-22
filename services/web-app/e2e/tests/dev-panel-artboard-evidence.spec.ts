import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';

const evidenceRoot =
  process.env.DEV_PANEL_EVIDENCE_DIR ??
  path.join(process.cwd(), 'dev-panel-evidence');

const prisma = createE2EPrismaClient();

test.describe('Dev panel artboard evidence', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test.beforeAll(() => {
    mkdirSync(evidenceRoot, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.request.post('/auth/dev-login', {
      form: { email: 'dev.teacher@yawp.local', redirectTo: '/app/assignments' },
    });
    await prisma.setting.upsert({
      where: { name: 'feature_flag.demo-feedback-widget' },
      create: {
        name: 'feature_flag.demo-feedback-widget',
        value: 'true',
        valueType: 'boolean',
      },
      update: { value: 'true' },
    });
  });

  const shot = async (page: import('@playwright/test').Page, artboard: string) => {
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(evidenceRoot, `${artboard}.png`),
      fullPage: false,
    });
  };

  test('capture designed panel and feedback states', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/assignments');
    await page.getByRole('button', { name: 'Open developer tools' }).click();
    await expect(
      page.getByRole('complementary', { name: 'Developer tools' })
    ).toBeVisible();
    await shot(page, '02');

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/app/assignments');
    await page.getByRole('button', { name: 'Open developer tools' }).click();
    await shot(page, '04');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app/assignments');
    await page.getByRole('button', { name: 'Open developer tools' }).click();
    await shot(page, '06');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().clearCookies();
    await page.goto('/app/assignments');
    await page.getByRole('button', { name: 'Open developer tools' }).click();
    await shot(page, '34');
    await page.getByRole('button', { name: 'Enter access code' }).click();
    await shot(page, '35');

    await page.request.post('/auth/dev-login', {
      form: { email: 'dev.teacher@yawp.local', redirectTo: '/app/assignments' },
    });
    await page.goto('/app/assignments');
    await page.getByRole('button', { name: 'Open developer tools' }).click();
    await page.getByRole('button', { name: 'Choose a state to jump to' }).click();
    await shot(page, '19');

    await page
      .locator('input[name="free-tier-state"]')
      .first()
      .check();
    await page.getByRole('checkbox').setChecked(false);
    await page.getByRole('button', { name: 'Jump to this state' }).click();
    await expect(
      page.getByRole('heading', { name: 'Change the signed-in account?' })
    ).toBeVisible();
    await shot(page, '20');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByLabel('Use a throwaway test account').setChecked(true);
    await page
      .locator('input[name="free-tier-state"]')
      .first()
      .check();
    await page.route('**/api/dev-panel/free-tier-jump', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          redirectTo: '/app',
          steps: [
            { id: 'account', label: 'Made test account: test@yawp.local', done: true },
            { id: 'state', label: 'Setting up Pending admin review', done: true },
            { id: 'reload', label: 'Reloading Yawp!', done: false },
          ],
        }),
      });
    });
    await page.getByRole('button', { name: 'Jump to this state' }).click();
    await expect(page.getByText('Switching…')).toBeVisible();
    await shot(page, '21');
    await page.unroute('**/api/dev-panel/free-tier-jump');

    await page.goto('/app/assignments');
    await page.getByRole('button', { name: 'Open developer tools' }).click();
    await page.getByRole('button', { name: 'Give feedback' }).click();
    await shot(page, '58');

    await page.getByRole('button', { name: 'Send feedback' }).click();
    await expect(page.getByRole('alert')).toHaveText(/Add a note/);
    await shot(page, '62');

    await page.getByLabel('Note').fill('Evidence note for sent state');
    await page.route('**/api/demo-feedback', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
    await page.getByRole('button', { name: 'Send feedback' }).click();
    await expect(page.getByRole('status')).toContainText('Thank you');
    await shot(page, '67');
    await page.unroute('**/api/demo-feedback');
    await page.getByRole('button', { name: 'Send more feedback' }).click();

    await page.getByLabel('Note').fill('Evidence note kept on error');
    await page.route('**/api/demo-feedback', async (route) => {
      await route.fulfill({
        status: 503,
        json: { error: 'Could not save feedback. Please try again.' },
      });
    });
    await page.getByRole('button', { name: 'Send feedback' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await shot(page, '73');
    await page.unroute('**/api/demo-feedback');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app/assignments');
    await page.getByRole('button', { name: 'Open developer tools' }).click();
    await page.getByRole('button', { name: 'Give feedback' }).click();
    await page.getByLabel('Note').fill('Mobile footer evidence');
    await shot(page, '74');

    await page.getByLabel('Note').fill('Partly typed note before reload');
    await page.reload();
    await expect(page.getByRole('complementary', { name: 'Developer tools' })).toBeVisible();
    await page.getByRole('button', { name: 'Give feedback' }).click();
    await expect(page.getByLabel('Note')).toHaveValue('Partly typed note before reload');
    await shot(page, '85');
  });
});
