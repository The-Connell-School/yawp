import { expect, test } from '../test-setup';
import { setFreeTierFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';
import { fillFreeTierWaitlistForm } from '../helpers/free-tier-waitlist-form';

test.describe.serial('Free tier feature flag', () => {
  test.afterAll(async () => {
    await setFreeTierFlag(true);
  });

  test('returns 404 for /free when the flag is off', async ({ page }) => {
    await setFreeTierFlag(false);
    const response = await page.goto('/free');
    expect(response?.status()).toBe(404);
  });

  test('form POST to /free returns 404 and does not create a waitlist row when off', async ({
    page,
  }) => {
    await setFreeTierFlag(false);
    const email = `e2e-flag-post-off+${Date.now()}@yawp.local`;
    const prisma = createE2EPrismaClient();
    try {
      const response = await page.request.post('/free?index', {
        form: {
          intent: 'waitlist',
          name: 'Flag POST Off',
          email,
          schoolName: 'Flag High',
          location: 'Local',
          gradeLevel: '10',
        },
      });
      expect(response.status()).toBe(404);
      const count = await prisma.freeTierApplication.count({ where: { email } });
      expect(count).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
    await page.goto('/free');
    expect((await page.goto('/free'))?.status()).toBe(404);
  });

  test('onboarding waitlist works when the flag is on', async ({ page }) => {
    await setFreeTierFlag(true);
    await page.goto('/free');
    await expect(
      page.getByRole('heading', { name: /Welcome to Yawp!|Try Yawp!/i })
    ).toBeVisible();
    await fillFreeTierWaitlistForm(page, {
      name: 'Flag E2E',
      email: `e2e-flag+${Date.now()}@yawp.local`,
      schoolName: 'Flag High',
      location: 'Local',
      gradeLevel: '10',
    });
    await page.getByRole('button', { name: /Join the waitlist/i }).click();
    await expect(page.getByRole('status')).toContainText(/on the list/i);
  });
});
