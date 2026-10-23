import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import { openDevToolsPanel } from '../helpers/dev-panel-feedback';
import { listCatalogFreeTierJumpExpectations } from '../../app/dev-panel/free-tier-jump-expectations';

const prisma = createE2EPrismaClient();

async function ensureDevTeacherSignedIn(page: import('@playwright/test').Page) {
  await page.context().clearCookies();
  await page.request.post('/auth/dev-login', {
    form: { email: 'dev.teacher@yawp.local', redirectTo: '/app/assignments' },
  });
}

test.describe('Dev panel free-tier state jumps', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    await prisma.setting.upsert({
      where: { name: 'feature_flag.free_tier' },
      create: {
        name: 'feature_flag.free_tier',
        value: 'true',
        valueType: 'boolean',
      },
      update: { value: 'true' },
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

  test('every catalog state jumps successfully', async ({ page }) => {
    test.setTimeout(600_000);
    const entries = listCatalogFreeTierJumpExpectations();

    for (const entry of entries) {
      await test.step(entry.stateId, async () => {
        await ensureDevTeacherSignedIn(page);
        await page.goto('/app/assignments');
        await page.evaluate(() => localStorage.removeItem('yawp-dev-panel'));
        await page.reload();

        const tools = await openDevToolsPanel(page);
        await tools.getByRole('button', { name: /^Free-tier states/ }).click();
        const stateSheet = page.getByRole('dialog', { name: 'Free-tier states' });
        await expect(stateSheet).toBeVisible({ timeout: 15_000 });

        await stateSheet
          .getByRole('checkbox', { name: 'Use a throwaway test account' })
          .setChecked(true);
        await stateSheet
          .locator('label')
          .filter({ hasText: entry.label })
          .getByRole('radio')
          .check({ force: true });

        const jumpResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/api/dev-panel/free-tier-jump') &&
            response.request().method() === 'POST',
          { timeout: 120_000 }
        );
        await stateSheet.getByRole('button', { name: 'Jump to this state' }).click();
        const response = await jumpResponse;
        const body = await response.json().catch(() => null);
        expect.soft(response.ok(), `${entry.stateId} API HTTP status`).toBe(true);
        expect.soft(body?.ok, `${entry.stateId} API ok flag`).toBe(true);
        if (!response.ok() || !body?.ok) {
          return;
        }

        const redirectTo = String(body.redirectTo);
        if (entry.adminSide) {
          expect
            .soft(new URL(redirectTo, page.url()).pathname, entry.stateId)
            .toContain(entry.redirectPath);
          await page.goto(redirectTo);
          await expect
            .soft(page.getByText('Lincoln High School', { exact: false }))
            .toBeVisible({ timeout: 30_000 });
          await expect
            .soft(page.getByText('Test Teacher', { exact: false }))
            .toBeVisible({ timeout: 30_000 });
          return;
        }

        await page.waitForURL(
          (url) => url.pathname.startsWith(entry.redirectPath.split('?')[0]!),
          { timeout: 120_000 }
        );
        if (entry.toastLabel) {
          await expect
            .soft(
              page.locator('.yawp-dev-panel-jump-toast').getByText(entry.toastLabel, {
                exact: false,
              })
            )
            .toBeVisible({ timeout: 30_000 });
        }
      });
    }
  });
});
