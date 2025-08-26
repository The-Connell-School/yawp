import { test, expect } from '../test-setup';
import { PrismaClient } from '@app/prisma';
import { generateTOTP } from '../../app/utils/totp.server';

test.describe('Authentication - student sign up', () => {
  test('signs up a student via invitation flow and reaches /app', async ({
    page,
    e2eContext,
  }) => {
    const prisma = new PrismaClient();
    try {
      // Use seeded school/teacher from e2eContext
      const schoolCode = e2eContext.schoolCode;
      const teacherName = e2eContext.teacherName;

      // Act 1: request signup for student
      const studentEmail = `student-e2e-${Date.now()}@example.com`;
      await page.goto('/auth/inv/signup');
      await page.locator('input[name="email"]').fill(studentEmail);
      await page.locator('input[name="schoolCode"]').fill(schoolCode);
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
      await page.waitForSelector('text=Please enter your details.', {
        timeout: 15000,
      });

      // Act 3: complete onboarding form
      await page.locator('input[name="name"]').fill('Student E2E');

      // Select teacher
      await page
        .locator(
          'xpath=//label[contains(normalize-space(.),"Teacher")]/following::button[1]'
        )
        .click();
      await page.waitForSelector(`[role="option"]:has-text("${teacherName}")`, {
        timeout: 10000,
      });
      await page
        .locator(`[role=\"option\"]:has-text(\"${teacherName}\")`)
        .click();

      // Select grade
      await page
        .locator(
          'xpath=//label[contains(normalize-space(.),"Grade")]/following::button[1]'
        )
        .click();
      await page.locator('[role="option"]:has-text("9th")').click();

      // Select period
      await page
        .locator(
          'xpath=//label[contains(normalize-space(.),"Period")]/following::button[1]'
        )
        .click();
      await page.locator('[role="option"]:has-text("1st")').click();

      // Passwords
      await page.locator('input[name="password"]').fill('strong-password-123');
      await page
        .locator('input[name="confirmPassword"]')
        .fill('strong-password-123');

      await page.getByRole('button', { name: /create an account/i }).click();

      // Assert: lands on /app dashboard
      await page.waitForURL('**/app**', { timeout: 15000 });
      await expect(page.getByTestId('app._index')).toBeVisible();
    } finally {
      await prisma.$disconnect();
    }
  });
});
