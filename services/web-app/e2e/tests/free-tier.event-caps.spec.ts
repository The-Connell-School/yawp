import { expect, test } from '@playwright/test';
import path from 'node:path';

// Opt-in against an isolated local fixture with a bypass token and denied
// admission. The fixture must have no outbound email/provider credentials.
const base = process.env.FREE_TIER_EVENT_CAPS_TEST_URL;
const token = process.env.FREE_TIER_EVENT_CAPS_TEST_TOKEN;
const reason = process.env.FREE_TIER_EVENT_CAPS_DENIAL || 'cap_reached';
test.skip(!base || !token, 'Requires isolated local event-cap fixture');

test('event admission denial has distinct feedback and a waitlist path', async ({ page, request }) => {
  const input = {
    token, name: 'Local cap evidence', email: 'caps-evidence@yawp.local',
    schoolName: 'Local demo', location: 'Austin', gradeLevel: '10',
  };
  const response = await request.post(`${base}/api/free-tier/token`, { data: input });
  expect(response.status()).toBe(reason === 'cap_reached' ? 409 : 402);
  expect(await response.json()).toEqual({ ok: false, reason });

  await page.goto(`${base}/free?t=${encodeURIComponent(token!)}`);
  await page.waitForLoadState('networkidle');
  for (const [field, value] of Object.entries(input)) {
    if (field !== 'token') await page.locator(`[name="${field}"]`).fill(value!);
  }
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/free')),
    page.getByRole('button', { name: 'Continue', exact: true }).click(),
  ]);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await page.waitForTimeout(500);
  if (process.env.FREE_TIER_EVENT_CAPS_SHOTS) {
    await page.screenshot({ path: path.join(process.env.FREE_TIER_EVENT_CAPS_SHOTS,
      `${reason}-${process.env.FREE_TIER_EVENT_CAPS_PHASE || 'after'}.png`), fullPage: false, animations: 'disabled' });
  }
  const message = reason === 'cap_reached'
    ? 'This free classroom event is full.'
    : 'This event link is paused because the current free-tier budget has been reached.';
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join the waitlist', exact: true })).toHaveAttribute('href', '/free');
});
