import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadE2eEnvFromFile } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
const require = createRequire(import.meta.url);
const { encode } = require(require.resolve('turbo-stream', { paths: [require.resolve('react-router')] }));

const before = process.env.LEGAL_EVIDENCE_PHASE === 'before';
const evidence = process.env.LEGAL_EVIDENCE_DIR;
const legalOnly = process.env.LEGAL_ONLY === 'true';
// The normal smoke runner writes its database URL to .env.e2e. Local CLI
// evidence can supply E2E_DATABASE_URL explicitly, or preconfigure its fixture.
loadE2eEnvFromFile();
let restoreFlag: (() => Promise<void>) | undefined;
test.beforeAll(async () => {
  if (legalOnly || !process.env.E2E_DATABASE_URL) return;
  const prisma = createE2EPrismaClient();
  const name = 'feature_flag.free_tier';
  const previous = await prisma.setting.findUnique({ where: { name } });
  await prisma.setting.upsert({
    where: { name }, create: { name, value: 'true', valueType: 'boolean' }, update: { value: 'true' },
  });
  restoreFlag = async () => {
    try {
      if (previous) await prisma.setting.update({ where: { name }, data: { value: previous.value } });
      else await prisma.setting.delete({ where: { name } });
    } finally { await prisma.$disconnect(); }
  };
});
test.afterAll(async () => { await restoreFlag?.(); });

async function capture(page: import('@playwright/test').Page, name: string, status?: number) {
  if (!evidence) return;
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: true });
  fs.appendFileSync(path.join(evidence, 'manifest.jsonl'), JSON.stringify({
    file: `${name}.png`, url: page.url(), status, viewport: page.viewportSize(),
    timestamp: new Date().toISOString(), sha: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
    fixture: name.startsWith('fixture-') ? 'Real signup DOM with intercepted single-fetch action result; no application writes or provider calls' : 'Unauthenticated browser, isolated project CLI local-dev database, no live providers',
    baseSha: '954fbaae',
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
    if (!before) {
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await capture(page, `mobile-${route!.slice(1)}`, response?.status());
    }
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

for (const [name, result, message] of [
  ['waitlist', { ok: true, redeemed: true, bypassWaitlist: false }, "You're on the list"],
  ['bypass', { ok: true, redeemed: true, bypassWaitlist: true }, 'Check your email'],
  ['cap', { ok: false, error: 'cap_reached' }, 'This free classroom event is full.'],
  ['budget', { ok: false, error: 'budget_exceeded' }, 'This event link is paused because the current free-tier budget has been reached.'],
] as const) {
  test(`signup ${name} presentation with intercepted action (no email or analytics)`, async ({ page }) => {
    test.skip(before || legalOnly, 'After-change UI regression only');
    await page.goto('/free?t=legal-presentation-fixture');
    await page.route(/\/free\.data(?:\?|$)/, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({
        status: 200, contentType: 'text/x-script',
        body: await new Response(encode({ data: result })).text(),
      });
    });
    for (const [field, value] of Object.entries({
      name: 'Local Teacher', email: 'legal-fixture@example.test', schoolName: 'Example Organization', location: 'Local', gradeLevel: '10',
    })) await page.locator(`input[name="${field}"]`).fill(value);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    if (!result.ok) await expect(page.getByRole('link', { name: 'Join the waitlist', exact: true })).toBeVisible();
    await capture(page, `fixture-${name}`);
  });
}
