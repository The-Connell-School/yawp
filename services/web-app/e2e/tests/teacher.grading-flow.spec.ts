import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { EDITOR_SELECTOR } from '../test-helpers';
import type { Page } from '@playwright/test';
import { assignTeacherToClass, createTeacherInvitation } from '../db-helpers';

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

function parseShownGrammarCounts(text: string): {
  shown: number;
  total: number;
} {
  const match = text.match(/AI grammar issues shown:\s*(\d+)\s*\/\s*(\d+)/i);
  if (!match) {
    throw new Error(`Unable to parse grammar issue counts from: ${text}`);
  }
  return {
    shown: Number(match[1]),
    total: Number(match[2]),
  };
}

const RUBRIC_KEYS = [
  'thesis_and_content',
  'organization_and_structure',
  'evidence_and_support',
  'voice_and_style',
  'grammar_and_mechanics',
] as const;
const RUBRIC_EXPECTATIONS: Record<
  (typeof RUBRIC_KEYS)[number],
  {
    label: RegExp;
    score: '1' | '2' | '3' | '4' | '5';
  }
> = {
  thesis_and_content: { label: /Thesis\/Content/i, score: '5' },
  organization_and_structure: {
    label: /Organization\/Structure/i,
    score: '1',
  },
  evidence_and_support: { label: /Evidence\/Support/i, score: '5' },
  voice_and_style: { label: /Voice\/Style/i, score: '1' },
  grammar_and_mechanics: {
    label: /Grammar\/Syntax\/Formatting/i,
    score: '1',
  },
};

test.describe.serial('Teacher onboarding and grading lifecycle', () => {
  test('completes teacher flow with one live grading-assistant call', async ({
    page,
    e2eContext,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Live AI E2E runs only in Chromium to control cost.'
    );
    test.skip(
      !process.env.ANTHROPIC_API_KEY,
      'ANTHROPIC_API_KEY is required for live grading validation.'
    );

    const prisma = createE2EPrismaClient();
    try {
      const submissionId = e2eContext.submittedSubmissionId;

      const teacherEmail = `teacher-onboard-${Date.now()}@example.com`;
      const teacherPassword = 'teacher-strong-password-123';
      const { otp } = await createTeacherInvitation({
        prisma,
        email: teacherEmail,
        organizationId: e2eContext.organizationId,
      });

      const verifySearch = new URLSearchParams({
        type: 'onboard-teacher',
        target: teacherEmail,
      }).toString();
      await openVerifyPage(page, verifySearch);
      await fillCodeInputWithRetry(page, otp);
      await page.getByRole('button', { name: /submit/i }).click();
      await page.waitForURL('**/auth/inv/onboard-teacher**', {
        timeout: 15000,
      });

      await page.locator('input[name="name"]').fill('Teacher Flow E2E');
      await page.locator('button[role="combobox"]').first().click();
      await page.locator('[role="option"]').first().click();
      await page.locator('input[name="password"]').fill(teacherPassword);
      await page.locator('input[name="confirmPassword"]').fill(teacherPassword);
      await page.getByRole('button', { name: /create an account/i }).click();
      await page.waitForURL('**/app**', { timeout: 15000 });
      await expect(page.getByTestId('app._index')).toBeVisible();

      await assignTeacherToClass({
        prisma,
        teacherEmail,
        classId: e2eContext.classId,
      });

      await page.goto(`/app/my-classes/${e2eContext.classId}`);
      await page.waitForLoadState('networkidle');

      // Teacher views submitted document in tutor mode via the document editor
      await page.goto(
        `/app/documents/${e2eContext.submittedDocumentId}?left=tutor&exitTo=${encodeURIComponent(
          `/app/my-classes/${e2eContext.classId}`
        )}`
      );
      await page.waitForLoadState('networkidle');

      const editor = page.locator(EDITOR_SELECTOR).first();
      await expect(editor).toBeVisible({ timeout: 10000 });
      await editor.click();
      await editor.type(' Teacher review note from E2E.');
      await expect(editor).toContainText('Teacher review note from E2E.');

      await editor.click();
      await page.keyboard.press('Control+A');
      await page.getByTestId('editor-add-comment').click();
      await expect(page.locator('[id^="comment-"]').first()).toBeVisible({
        timeout: 10000,
      });

      await page.getByRole('button', { name: /exit/i }).click();
      await page.waitForURL(`**/app/my-classes/${e2eContext.classId}**`, {
        timeout: 15000,
      });

      // Teacher clicks View details from the class Documents tab — submissions route with edit=1
      await expect(page.getByRole('tab', { name: /documents/i })).toBeVisible({
        timeout: 10000,
      });
      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=documents&status=needs-grading`
      );
      await page.waitForLoadState('networkidle');
      await page
        .getByRole('link', { name: /view details/i })
        .first()
        .click();
      await page.waitForURL(/\/app\/submissions\/[^/]+\?edit=1/, {
        timeout: 15000,
      });
      await page.waitForLoadState('networkidle');

      for (const key of RUBRIC_KEYS) {
        await expect(
          page.getByRole('button', { name: RUBRIC_EXPECTATIONS[key].label })
        ).toBeVisible();
        await page.getByTestId(`grading-rubric-score-${key}`).click();
        await page
          .getByRole('option', {
            name: new RegExp(
              `^${RUBRIC_EXPECTATIONS[key].score}\\s+-\\s+`,
              'i'
            ),
          })
          .click();
        await page
          .getByTestId(`grading-rubric-comment-${key}`)
          .fill(`Manual rubric note for ${key}.`);
      }

      await page.getByRole('button', { name: /^recalculate$/i }).click();
      await expect
        .poll(
          async () =>
            await page.getByTestId('grading-overall-percentage').inputValue(),
          { timeout: 15000 }
        )
        .toBe('77');

      await page
        .getByTestId('grading-overall-comment')
        .fill('Manual overall teacher feedback before AI suggestions.');
      // Blur the field to trigger auto-save
      await page.getByTestId('grading-overall-percentage').click();
      await expect(page.getByTestId('grading-auto-save-status')).toContainText(
        'Saved',
        { timeout: 15000 }
      );

      let aiRequests = 0;
      await page.route('**/api/domain/grade-essay-ai', async (route) => {
        if (route.request().method() === 'POST') aiRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 750));
        await route.continue();
      });

      const gradingAssistantButton = page.getByTestId(
        'grading-assistant-generate'
      );
      await page.getByTestId('grading-assistant-generate').click();
      await page.getByRole('button', { name: /^replace$/i }).click();
      await expect(gradingAssistantButton).toContainText('Grading');
      await expect(
        gradingAssistantButton.locator('svg.animate-spin')
      ).toBeVisible({
        timeout: 15000,
      });

      await expect.poll(() => aiRequests, { timeout: 120000 }).toBe(1);
      await page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/grade-essay-ai') &&
          response.request().method() === 'POST' &&
          response.status() === 200,
        { timeout: 120000 }
      );

      await expect(page.getByText(/AI grammar issues shown:/i)).toBeVisible({
        timeout: 30000,
      });
      await expect(
        page.getByText(/No grammar\/syntax issues yet/i)
      ).toHaveCount(0);
      await expect(page.getByTestId('grading-overall-comment')).not.toHaveValue(
        ''
      );

      const grammarCounter = page.getByText(/AI grammar issues shown:/i);
      const beforeRemove = parseShownGrammarCounts(
        (await grammarCounter.textContent()) ?? ''
      );
      await page
        .getByRole('button', { name: /^remove$/i })
        .first()
        .click();
      await expect
        .poll(async () => {
          const text = (await grammarCounter.textContent()) ?? '';
          return parseShownGrammarCounts(text).total;
        })
        .toBe(Math.max(0, beforeRemove.total - 1));
      // Blur a field to trigger auto-save after grammar issue removal
      await page.getByTestId('grading-overall-comment').click();
      await page.getByTestId('grading-overall-percentage').click();
      await expect(page.getByTestId('grading-auto-save-status')).toContainText(
        'Saved',
        { timeout: 15000 }
      );
      await page.reload();
      await page.waitForLoadState('networkidle');
      const afterReload = parseShownGrammarCounts(
        ((await page.getByText(/AI grammar issues shown:/i).textContent()) ??
          '') as string
      );
      expect(afterReload.total).toBe(Math.max(0, beforeRemove.total - 1));

      // Select text in the essay panel (static HTML, not ProseMirror)
      await page.evaluate(() => {
        // The essay panel renders the submitted HTML in a plain div
        const essayRoot = document.querySelector('[class*="no-scrollbar"]');
        if (!essayRoot) return;
        const walker = document.createTreeWalker(
          essayRoot,
          NodeFilter.SHOW_TEXT
        );
        const firstNode = walker.nextNode();
        if (!firstNode?.textContent) return;
        const end = Math.min(firstNode.textContent.length, 28);
        const range = document.createRange();
        range.setStart(firstNode, 0);
        range.setEnd(firstNode, end);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
      });
      // Wait for SelectionToolbar to appear, then click Comment
      await page
        .getByRole('button', { name: /^comment$/i })
        .click({ timeout: 5000 });
      await page
        .locator('textarea[placeholder="Write your comment..."]')
        .fill('Grade comment from teacher E2E flow.');
      await page.getByRole('button', { name: /^save$/i }).click();
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByText('Grade comment from teacher E2E flow.')
      ).toBeVisible({ timeout: 10000 });

      const submissionBeforeMutation = await prisma.submission.findUnique({
        where: { id: submissionId },
        select: { id: true, text: true },
      });
      expect(submissionBeforeMutation?.id).toBeTruthy();
      expect(submissionBeforeMutation?.text).toContain(
        'The importance of reading cannot be overstated.'
      );

      const mutatedSubmissionText =
        'SUBMISSION MUTATION SHOULD NOT APPEAR IN GRADED VIEW';
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          text: mutatedSubmissionText,
          html: `<p>${mutatedSubmissionText}</p>`,
        },
      });

      // Navigate back to class page to verify graded status
      await page.goto(`/app/my-classes/${e2eContext.classId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('tab', { name: /documents/i }).click();
      const actionsButton = page.getByTestId('teacher-document-work-actions');
      await expect(actionsButton).toBeVisible({
        timeout: 10000,
      });
      await actionsButton.click();
      await page.getByRole('menuitem', { name: /Release grades/i }).click();
      await page.getByTestId('release-grades-confirm').click();
      await page.waitForLoadState('networkidle');
      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=documents&status=released`
      );
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByRole('cell', { name: /E2E Doc/i }).first()
      ).toBeVisible({ timeout: 15000 });

      await page.goto(`/app/submissions/${submissionBeforeMutation!.id}`);
      await page.waitForLoadState('networkidle');
      // Verify the submission page shows the original snapshotted content, not the mutated text
      await expect(
        page.getByText('The importance of reading cannot be overstated.')
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(mutatedSubmissionText)).toHaveCount(0);
      expect(aiRequests).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });
});
