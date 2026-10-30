import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { generateTOTP } from '../../app/utils/totp.server';
import type { Page } from '@playwright/test';

const E2E_BASE_URL = 'http://127.0.0.1:5173';

async function followStudentInviteVerifyLink(page: Page, verifySearch: string) {
  await page.goto('about:blank');
  await page.goto(`${E2E_BASE_URL}/auth/inv/verify?${verifySearch}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page).toHaveURL(/\/auth\/inv\/onboard-student/);
}

async function fillCodeInputWithRetry(page: Page, code: string) {
  const input = page.getByRole('textbox', { name: /code/i }).first();
  await expect(async () => {
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.click();
    await input.fill(code);
    await expect(input).toHaveValue(code, { timeout: 3000 });
  }).toPass({ timeout: 15000 });
}

async function verifyStudentSignupCodeWithRetry(args: {
  page: Page;
  prisma: ReturnType<typeof createE2EPrismaClient>;
  studentEmail: string;
  attempts?: number;
}) {
  const { page, prisma, studentEmail, attempts = 3 } = args;
  let lastError: unknown = new Error('Verification failed without an error');

  for (let attempt = 0; attempt < attempts; attempt++) {
    const invitation = await prisma.invitation.findUnique({
      where: {
        target_type: { target: studentEmail, type: 'onboard-student' },
      },
    });

    if (!invitation) {
      throw new Error('Invitation missing before verification step');
    }

    const { otp } = await generateTOTP({
      secret: invitation.secret,
      algorithm: invitation.algorithm as any,
      period: invitation.period,
      charSet: invitation.charSet,
      digits: invitation.digits,
    });

    const verifySearch = new URLSearchParams({
      type: 'onboard-student',
      target: studentEmail,
      code: otp,
    }).toString();

    await followStudentInviteVerifyLink(page, verifySearch);
    return;
  }

  throw lastError;
}

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
      await expect
        .poll(
          () =>
            prisma.invitation.findUnique({
              where: {
                target_type: { target: studentEmail, type: 'onboard-student' },
              },
            }),
          { timeout: 5000, message: 'Invitation not created in time' },
        )
        .not.toBeNull();

      // Act 2: verify invitation code with a retry path for timing-sensitive OTP boundaries.
      await verifyStudentSignupCodeWithRetry({
        page,
        prisma,
        studentEmail,
      });

      // Act 3: complete onboarding form
      await page.waitForLoadState('networkidle');
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
