import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Component fixtures only: these do not exercise admission or shared persistence.
for (const width of [1280, 390]) {
  for (const state of ['legacy-form', 'v2-form', 'legacy-confirmation', 'v2-confirmation', 'v2-decline', 'v2-event-confirmation']) {
    test(`${state} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
      await page.goto(`/e2e/fixtures/free-tier-welcome/index.html?state=${state}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const v2 = state.startsWith('v2');
      if (state.endsWith('form')) {
        await expect(page.getByText(v2 ? /We're\ so\ glad\ you're\ here,\ and\ we\ can't\ wait\ for\ you\ to\ use\ Yawp!\ with\ your\ students\./ : 'Join the waitlist. We let teachers in a group at a time.')).toBeVisible();
        const name = page.getByRole('textbox', { name: v2 ? 'First and last name' : 'Your name', exact: true });
        await expect(name).toHaveAttribute('name', 'name');
        await expect(name).toHaveAttribute('required', '');
        await name.fill('Ada Lovelace');
        await expect(name).toHaveValue('Ada Lovelace');
        await name.fill('');
        await name.blur();
        await expect(page.locator('input[name="name"]')).toHaveCount(1);
      } else if (state === 'v2-decline') {
        await expect(page.getByRole('status')).toContainText('high school');
        await expect(page.getByText(/site license/)).toBeVisible();
        await expect(page.getByRole('link', { name: 'hello@yawp.school' })).toHaveAttribute('href', 'mailto:hello@yawp.school');
        await expect(page.getByRole('button')).toHaveCount(0);
      } else if (state === 'v2-event-confirmation') {
        await expect(page.getByRole('status')).toContainText('Check your email');
        await expect(page.getByText('Your join link is on its way to ada@example.test.')).toBeVisible();
      } else {
        await expect(page.getByRole('status')).toContainText(v2 ? "You're on the list!" : "You're on the list");
        await expect(page.getByText(v2 ? /We'll email you at ada@example\.test as soon as your spot opens up\./ : 'We will email ada@example.test when your classroom is ready.')).toBeVisible();
        if (v2) await expect(page.getByRole('status').locator('svg')).toHaveClass(/text-emerald-800/);
      }
      await expect(page.getByRole('link', { name: 'Terms of Service', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Privacy Policy', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      if (process.env.FREE_WELCOME_EVIDENCE_DIR) {
        fs.mkdirSync(process.env.FREE_WELCOME_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.FREE_WELCOME_EVIDENCE_DIR, `${state}-${width}-impl.png`), fullPage: true });
      }
    });
  }
}
