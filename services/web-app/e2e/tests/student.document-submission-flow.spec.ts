import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { generateTOTP } from '../../app/utils/totp.server';
import { setDocumentSubmissionForSchool } from '../db-helpers';
import { EDITOR_SELECTOR } from '../test-helpers';
import type { Page } from '@playwright/test';

const E2E_BASE_URL = 'http://127.0.0.1:5173';

async function openVerifyPage(page: Page, verifySearch: string) {
  await page.goto('about:blank');
  await page.goto(`${E2E_BASE_URL}/auth/inv/verify?${verifySearch}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page).toHaveURL(/\/auth\/inv\/verify/);
}

async function fillCodeInputWithRetry(page: Page, code: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const input = page.getByRole('textbox', { name: /code/i }).first();
    try {
      await expect(input).toBeVisible({ timeout: 5000 });
      await input.click();
      await input.fill(code);
      await expect(input).toHaveValue(code, { timeout: 3000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(200);
    }
  }
  throw lastError;
}

test.describe.serial('Student onboarding, document, tutor, comments, and submission', () => {
  test('completes end-to-end student flow with one live tutor call', async ({
    page,
    e2eContext,
    browserName,
    helpers,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Live AI E2E runs only in Chromium to control cost.'
    );
    test.skip(
      !process.env.ANTHROPIC_API_KEY,
      'ANTHROPIC_API_KEY is required for live tutor validation.'
    );

    const prisma = createE2EPrismaClient();
    try {
      const studentEmail = `student-flow-${Date.now()}@example.com`;
      await page.goto('/auth/inv/signup');
      await page.locator('input[name="email"]').fill(studentEmail);
      await page.locator('input[name="code"]').fill(e2eContext.classCode);
      await page.getByRole('button', { name: /submit/i }).click();

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
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!invitation) throw new Error('Student invitation was not created.');

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
      }).toString();
      await openVerifyPage(page, verifySearch);
      await fillCodeInputWithRetry(page, otp);
      await page.getByRole('button', { name: /submit/i }).click();
      await page.waitForURL('**/auth/inv/onboard-student**', {
        timeout: 15000,
      });

      await page.locator('input[name="name"]').fill('Student Flow E2E');

      const classSelect = page.locator('button[role="combobox"]').first();
      if ((await classSelect.count()) > 0) {
        await classSelect.click();
        await page.locator('[role="option"]').nth(1).click();
      }

      await page
        .locator('input[name="password"]')
        .fill('strong-password-123-student-flow');
      await page
        .locator('input[name="confirmPassword"]')
        .fill('strong-password-123-student-flow');
      await page.getByRole('button', { name: /create account/i }).click();
      await page.waitForURL('**/app**', { timeout: 15000 });
      await expect(page.getByTestId('app._index')).toBeVisible();

      await page.getByRole('link', { name: /e2e course/i }).first().click();
      await page.waitForURL('**/app/assignment-types/**', { timeout: 15000 });
      await page.getByRole('button', { name: /^new/i }).click();
      await page.waitForURL('**/app/documents/**', { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      const pathParts = new URL(page.url()).pathname.split('/');
      const documentId = pathParts[pathParts.length - 1];
      if (!documentId) throw new Error('Failed to resolve created document id.');

      const editor = page.locator(EDITOR_SELECTOR).first();
      await expect(editor).toBeVisible({ timeout: 10000 });
      await editor.click();
      await editor.type(
        'Student end-to-end draft text with some rough ideas and grammar issue.'
      );
      await expect(editor).toContainText('Student end-to-end draft text');
      await helpers.waitForSaved();

      let tutorRequests = 0;
      await page.route('**/api/domain/tutor-response', async (route) => {
        if (route.request().method() === 'POST') tutorRequests += 1;
        await route.continue();
      });

      await page.getByTestId('tutor-chat-open').click();
      await page
        .getByTestId('tutor-chat-input')
        .fill('Ask me one revision question about this draft.');
      await page.getByTestId('tutor-chat-send').click();
      await expect
        .poll(() => tutorRequests, { timeout: 60000 })
        .toBe(1);
      await expect(page.locator('[data-tutor-message="true"]').last()).toBeVisible(
        {
          timeout: 60000,
        }
      );

      await editor.click();
      await page.keyboard.press('Control+A');
      await page.getByTestId('editor-add-comment').click();
      const commentCard = page.locator('[id^="comment-"]').first();
      await expect(commentCard).toBeVisible({ timeout: 10000 });
      const replyInput = commentCard.locator('textarea[placeholder="Reply..."]');
      await replyInput.fill('Replying to my own comment for E2E.');
      await replyInput.press('Control+Enter');
      await expect(
        commentCard.getByText('Replying to my own comment for E2E.')
      ).toBeVisible({ timeout: 10000 });

      await expect(page.getByTestId('document-submit-button')).toBeVisible({
        timeout: 10000,
      });
      await page.getByTestId('document-submit-button').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByTestId('document-finalize-submit').click();

      await expect(page.getByText('Submitted').first()).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByTestId('document-submit-button')).toHaveCount(0);

      const submitted = await prisma.document.findUnique({
        where: { id: documentId },
        select: { submissions: { take: 1, select: { id: true } } },
      });
      expect(submitted?.submissions.length).toBeGreaterThan(0);
      expect(tutorRequests).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });
});
