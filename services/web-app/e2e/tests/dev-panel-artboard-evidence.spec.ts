import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import {
  openDevToolsPanel,
  openGiveFeedback,
} from '../helpers/dev-panel-feedback';

const evidenceRoot =
  process.env.DEV_PANEL_EVIDENCE_DIR ??
  path.join(process.cwd(), 'dev-panel-evidence');
const artifactCopyRoot =
  process.env.DEV_PANEL_ARTIFACT_COPY_DIR ?? '/opt/cursor/artifacts/screenshots';

const prisma = createE2EPrismaClient();

test.describe('Dev panel artboard evidence', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test.beforeAll(() => {
    mkdirSync(evidenceRoot, { recursive: true });
    mkdirSync(artifactCopyRoot, { recursive: true });
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
    const file = path.join(evidenceRoot, `${artboard}.png`);
    await page.screenshot({
      path: file,
      fullPage: false,
    });
    try {
      copyFileSync(file, path.join(artifactCopyRoot, `${artboard}.png`));
    } catch {
      // CI may only have evidenceRoot writable.
    }
  };

  test('capture designed panel and feedback states', async ({ page }) => {
    test.setTimeout(240_000);
    await page.evaluate(() => localStorage.removeItem('yawp-dev-panel'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/assignments');
    await openDevToolsPanel(page);
    await shot(page, '01');

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/app/assignments');
    await openDevToolsPanel(page);
    await shot(page, '04');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app/assignments');
    await openDevToolsPanel(page);
    await shot(page, '06');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().clearCookies();
    await page.request.post('/auth/dev-login', {
      form: { email: 'dev.teacher@yawp.local', redirectTo: '/app/assignments' },
    });
    await page.goto('/app/assignments');
    await openDevToolsPanel(page);
    if (await page.getByRole('button', { name: 'Enter access code' }).count()) {
      await shot(page, '34');
      await page.getByRole('button', { name: 'Enter access code' }).click();
      await shot(page, '35');
      await page.keyboard.press('Escape');
    }

    const tools = await openDevToolsPanel(page);
    await tools.getByRole('button', { name: /^Free-tier states/ }).click();
    await tools
      .getByRole('button', { name: 'Choose a state to jump to', exact: true })
      .click();
    const stateSheet = page.getByRole('dialog', { name: 'Free-tier states' });
    await expect(stateSheet).toBeVisible({ timeout: 15_000 });
    await shot(page, '19');

    await stateSheet.locator('input[name="free-tier-state"]').first().check();
    await stateSheet
      .getByRole('checkbox', { name: 'Use a throwaway test account' })
      .setChecked(false);
    await stateSheet.getByRole('button', { name: 'Jump to this state' }).click();
    await expect(
      page.getByRole('heading', { name: 'Change the signed-in account?' })
    ).toBeVisible();
    await shot(page, '20');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await stateSheet
      .getByRole('checkbox', { name: 'Use a throwaway test account' })
      .setChecked(true);
    await stateSheet.locator('input[name="free-tier-state"]').first().check();
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
    await page.evaluate(() => {
      const locationRef = window.location;
      const original = locationRef.assign.bind(locationRef);
      locationRef.assign = (url: string | URL) => {
        (window as unknown as { __blockedJumpUrl?: string }).__blockedJumpUrl =
          String(url);
      };
      (window as unknown as { __restoreJumpAssign?: () => void }).__restoreJumpAssign =
        () => {
          locationRef.assign = original;
        };
    });
    await stateSheet.getByRole('button', { name: 'Jump to this state' }).click();
    await expect(stateSheet.getByRole('status').getByText('Switching…')).toBeVisible();
    await shot(page, '21');
    await page
      .evaluate(() => {
        (window as unknown as { __restoreJumpAssign?: () => void }).__restoreJumpAssign?.();
      })
      .catch(() => undefined);
    await page.unroute('**/api/dev-panel/free-tier-jump');
    await page.evaluate(() => localStorage.removeItem('yawp-dev-panel'));
    await page.request.post('/auth/dev-login', {
      form: { email: 'dev.teacher@yawp.local', redirectTo: '/app/assignments' },
    });
    await page.goto('/app/assignments');

    let { panel: feedbackDialog } = await openGiveFeedback(page);
    await shot(page, '55');

    await feedbackDialog.getByRole('button', { name: 'Send feedback' }).click();
    await expect(feedbackDialog.getByRole('alert')).toHaveText(/Add a note/);
    await shot(page, '57');

    await feedbackDialog.getByLabel('Note').fill('Evidence note for sent state');
    await page.route('**/api/demo-feedback', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
    await feedbackDialog.getByRole('button', { name: 'Send feedback' }).click();
    await expect(feedbackDialog.getByRole('status')).toContainText('Thank you');
    await shot(page, '59');

    await page.unroute('**/api/demo-feedback');
    await feedbackDialog.getByRole('button', { name: 'Send more feedback' }).click();

    await feedbackDialog.getByLabel('Note').fill('Evidence note kept on error');
    await page.route('**/api/demo-feedback', async (route) => {
      await route.fulfill({
        status: 503,
        json: { error: 'Could not save feedback. Please try again.' },
      });
    });
    await feedbackDialog.getByRole('button', { name: 'Send feedback' }).click();
    await expect(feedbackDialog.getByRole('alert')).toBeVisible();
    await shot(page, '60');

    await page.unroute('**/api/demo-feedback');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app/assignments');
    ({ panel: feedbackDialog } = await openGiveFeedback(page));
    await feedbackDialog.getByLabel('Note').fill('Mobile footer evidence');
    await shot(page, '72');

    await feedbackDialog.getByLabel('Note').fill('Partly typed note before reload');
    await page.reload();
    await openDevToolsPanel(page);
    ({ panel: feedbackDialog } = await openGiveFeedback(page));
    await expect(feedbackDialog.getByLabel('Note')).toHaveValue(
      'Partly typed note before reload',
      { timeout: 15_000 }
    );
    await shot(page, '56');
  });
});
