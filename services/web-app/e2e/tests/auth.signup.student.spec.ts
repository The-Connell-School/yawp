import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { generateTOTP } from '../../app/utils/totp.server';

test.describe('Authentication - student sign up', () => {
  test('signs up a student via invitation flow and reaches /app', async ({
    page,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      // Use seeded class code from e2eContext
      const classCode = e2eContext.classCode;

      // Act 1: request signup for student
      const studentEmail = `student-e2e-${Date.now()}@example.com`;
      await page.goto('/auth/inv/signup');
      await page.locator('input[name="email"]').fill(studentEmail);
      await page.locator('input[name="code"]').fill(classCode);
      await page.getByRole('button', { name: /submit/i }).click();

      // Assert: invitation exists (poll to avoid race with server redirect)
      let invitation: Awaited<
        ReturnType<typeof prisma.invitation.findUnique>
      > | null = null;
      for (let i = 0; i < 20; i++) {
        invitation = await prisma.invitation.findUnique({
          where: {
            target_type: { target: studentEmail, type: 'onboard-student' },
          },
        });
        if (invitation) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!invitation) throw new Error('Invitation not created in time');

      const { otp } = await generateTOTP({
        secret: invitation.secret,
        algorithm: invitation.algorithm as any,
        period: invitation.period,
        charSet: invitation.charSet,
        digits: invitation.digits,
      });
      // eslint-disable-next-line no-console
      console.log('Computed OTP for student signup:', otp);

      // Act 2: navigate to verify page (force http to avoid https redirect in dev)
      const verifySearch = new URLSearchParams({
        type: 'onboard-student',
        target: studentEmail,
      }).toString();
      await page.goto(`/auth/inv/verify?${verifySearch}`);

      // Submit verification code
      await page.locator('input[name="code"]').fill(otp);
      await page.getByRole('button', { name: /submit/i }).click();

      // Expect redirect to onboarding form
      await page.waitForURL('**/auth/inv/onboard-student**', {
        timeout: 15000,
      });

      // Act 3: complete onboarding form
      await page.locator('input[name="name"]').fill('Student E2E');

      // If there are multiple classes for the code, pick a class.
      const classSelect = page.locator('button[role="combobox"]').first();
      if ((await classSelect.count()) > 0) {
        await classSelect.click();
        await page.locator('[role="option"]').nth(1).click();
      }

      // Passwords
      await page.locator('input[name="password"]').fill('strong-password-123');
      await page
        .locator('input[name="confirmPassword"]')
        .fill('strong-password-123');

      await page.getByRole('button', { name: /create account/i }).click();

      // Assert: lands on /app dashboard
      await page.waitForURL('**/app**', { timeout: 15000 });
      await expect(page.getByTestId('app._index')).toBeVisible();
    } finally {
      await prisma.$disconnect();
    }
  });
});
