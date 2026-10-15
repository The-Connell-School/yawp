import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { signonFixtures } from '../fixtures/unified-signon/states';

const evidence = process.env.SIGNON_EVIDENCE_DIR;

for (const width of [1280, 390]) {
  test(`every artboard state is accessible and responsive at ${width}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    for (const fixture of signonFixtures) {
      await page.goto(`/e2e/fixtures/unified-signon/index.html?state=${fixture.id}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(fixture.title);
      await expect(page.locator('[data-signon-screen]')).toHaveAttribute('data-signon-screen', fixture.state.screen);
      await expect(page.getByRole('link', { name: 'Terms', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      if (fixture.id === 'entry-focus') await page.getByLabel('Email, handle, or class code').focus();
      if (evidence) {
        fs.mkdirSync(evidence, { recursive: true });
        const filename = `${fixture.artboard}-${fixture.id}-${width}-impl.png`;
        await page.screenshot({ path: path.join(evidence, filename), fullPage: true });
        fs.appendFileSync(path.join(evidence, 'manifest.jsonl'), JSON.stringify({ ...fixture, width, filename }) + '\n');
      }
    }
  });
}

test('entry validation, pending, back, safe redirect, Google unset, and handle ambiguity', async ({ page }) => {
  await page.goto('/e2e/fixtures/unified-signon/index.html?state=entry&redirectTo=%2Fapp%2Fmy-classes');
  const input = page.getByLabel('Email, handle, or class code');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Enter your email or handle.')).toBeVisible();
  await input.fill('bad@');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('That email looks incomplete. Check it and try again.')).toBeVisible();
  await input.fill('ENG-11X');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Continuing…' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Is ENG-11X a class code?' })).toBeVisible();
  await page.getByRole('button', { name: /No, it's my handle/ }).click();
  await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();
  await expect(page.locator('input[name=redirectTo]')).toHaveValue('/app/my-classes');
  await page.getByRole('button', { name: 'Use a different account' }).click();
  await expect(input).toBeFocused();
});

test('class choice and account-type paths keep join context without server effects', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') calls.push(request.url()); });
  await page.goto('/e2e/fixtures/unified-signon/index.html?state=class-found');
  await page.getByRole('button', { name: "I'm new to YAWP" }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Join your class' })).toBeVisible();
  expect(calls).toEqual([]);
});

test('OTP retry and membership selection are fixture responses only', async ({ page }) => {
  await page.goto('/e2e/fixtures/unified-signon/index.html?state=email-code');
  await page.getByRole('button', { name: 'Resend code', exact: true }).click();
  await expect(page.getByText('New code sent. Check spam too.')).toBeVisible();
  await page.getByLabel('Code', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByText("That code isn't right. Use the one from our most recent email.")).toBeVisible();
  await page.goto('/e2e/fixtures/unified-signon/index.html?state=membership');
  await page.getByRole('button', { name: /Summer Writing Lab/ }).click();
  await expect(page.getByRole('heading', { name: "You're in!" })).toBeVisible();
  expect(await page.context().cookies()).toEqual([]);
});
