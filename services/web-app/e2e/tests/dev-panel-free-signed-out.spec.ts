import { test, expect } from '@playwright/test';
import {
  openDevToolsPanel,
  waitForDevPanelReady,
} from '../helpers/dev-panel-feedback';
import { mintDevPanelPreviewAccessCookie } from '../helpers/dev-panel-preview-access';

const previewGateOn = process.env.PREVIEW_ACCESS_GATE === 'on';
const previewUnlockConfigured = Boolean(
  process.env.PREVIEW_MASTER_ACCESS_CODE ||
    process.env.PREVIEW_ACCESS_CODES ||
    process.env.PREVIEW_ACCESS_SEATS
);

test.describe('Developer tools on /free while signed out', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/free');
    await page.evaluate(() => localStorage.removeItem('yawp-dev-panel'));
  });

  test('without preview cookie opens locked panel', async ({ page }) => {
    test.skip(!previewGateOn, 'PREVIEW_ACCESS_GATE=on required for locked state');
    await openDevToolsPanel(page);
    await expect(page.getByText('Developer tools are locked')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Enter access code' })
    ).toBeVisible();
  });

  test('with valid preview cookie opens unlocked panel', async ({ page }) => {
    test.skip(!previewUnlockConfigured, 'Preview unlock env not configured');
    await mintDevPanelPreviewAccessCookie(page);
    await page.reload();
    await openDevToolsPanel(page);
    await waitForDevPanelReady(page);
    await expect(page.getByText('Sign in as')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Give feedback' })).toBeVisible();
  });

  test('with malformed preview cookie opens locked panel', async ({ page }) => {
    test.skip(!previewGateOn, 'PREVIEW_ACCESS_GATE=on required for locked state');
    await page.context().addCookies([
      {
        name: '__yawp_preview_access',
        value: 'not-a-valid-preview-seat-payload',
        url: page.url(),
      },
    ]);
    await page.reload();
    await openDevToolsPanel(page);
    await expect(page.getByText('Developer tools are locked')).toBeVisible();
  });

  test('Alt+Shift+D toggles panel while signed out on /free', async ({ page }) => {
    test.skip(!previewGateOn, 'PREVIEW_ACCESS_GATE=on required for locked state');
    await page.keyboard.press('Alt+Shift+D');
    await waitForDevPanelReady(page);
    await page.keyboard.press('Alt+Shift+D');
    await expect(page.locator('#devtools')).toHaveCount(0);
  });
});
