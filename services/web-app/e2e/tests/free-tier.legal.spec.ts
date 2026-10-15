import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const before = process.env.LEGAL_EVIDENCE_PHASE === 'before';
const evidence = process.env.LEGAL_EVIDENCE_DIR;
const legalOnly = process.env.LEGAL_ONLY === 'true';
async function capture(page: import('@playwright/test').Page, name: string, status?: number) {
  if (!evidence) return;
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: true });
  fs.appendFileSync(path.join(evidence, 'manifest.jsonl'), JSON.stringify({
    file: `${name}.png`, url: page.url(), status, viewport: page.viewportSize(),
    timestamp: new Date().toISOString(), sha: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
    fixture: 'Unauthenticated browser, isolated project CLI local-dev database, no live providers',
    configuration: process.env.LEGAL_CONFIGURATION || 'production gate off',
  }) + '\n');
}

for (const [route, title] of [['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Service']]) {
  test(`${route} is public without a session`, async ({ page }) => {
    const response = await page.goto(route!);
    expect(response?.status()).toBe(before ? 404 : 200);
    if (!before) {
      await expect(page.getByRole('heading', { name: title!, exact: true })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Public legal navigation' })).toBeVisible();
      expect(await page.context().cookies()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: '__yawp_preview_access' })]));
    }
    await capture(page, route!.slice(1), response?.status());
  });
}

test('signup visibly links to both public legal pages', async ({ page }) => {
  test.skip(legalOnly, 'Gate-on configurations cover direct public legal loads without changing signup access');
  const response = await page.goto('/free');
  await expect(page.getByRole('button', { name: 'Join the waitlist', exact: true })).toBeVisible();
  await capture(page, 'free', response?.status());
  if (before) {
    await expect(page.getByRole('link', { name: 'Privacy Policy', exact: true })).toHaveCount(0);
    return;
  }
  for (const [name, destination] of [['Privacy Policy', '/privacy'], ['Terms of Service', '/terms']]) {
    const link = page.getByRole('link', { name: name!, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', destination!);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await expect(page.getByRole('heading', { name: name!, exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Join the waitlist', exact: true })).toBeVisible();
  }
});
