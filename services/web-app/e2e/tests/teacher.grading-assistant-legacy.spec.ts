import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Teacher grading assistant legacy flow', () => {
  test('keeps the existing unlinked submission grading assistant button working', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      const submission = await prisma.submission.findUniqueOrThrow({
        where: { id: e2eContext.submittedSubmissionId },
        select: {
          document: { select: { assignmentTypeId: true } },
        },
      });
      const defaultLink = await prisma.assignmentTypeGradingAssistant.findFirst({
        where: {
          assignmentTypeId: submission.document.assignmentTypeId,
          isDefault: true,
          activeTo: null,
        },
      });
      expect(defaultLink).toBeNull();

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/submissions/${e2eContext.submittedSubmissionId}?edit=1`
      );
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('grading-assistant-generate')).toBeVisible();
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/grade-essay-ai') &&
          response.request().method() === 'POST'
      );
      await page.getByTestId('grading-assistant-generate').click();
      const response = await responsePromise;

      expect(response.status()).toBe(200);
      expect(response.request().postData() ?? '').toContain(
        `submissionId=${e2eContext.submittedSubmissionId}`
      );
      await expect(page.getByTestId('grading-overall-comment')).toHaveValue(
        'John, these legacy grading assistant suggestions still apply.'
      );
      await expect(page.getByTestId('grading-overall-percentage')).toHaveValue(
        '88'
      );

      await page.getByRole('button', { name: /Thesis\/Content/i }).click();
      await expect(
        page.getByTestId('grading-rubric-score-thesis_and_content')
      ).toContainText('5 - Exemplary');
      await expect(
        page.getByTestId('grading-rubric-comment-thesis_and_content')
      ).toHaveValue('Legacy thesis feedback from deterministic E2E.');

      await page
        .getByRole('button', { name: /Grammar\/Syntax\/Formatting/i })
        .click();
      await expect(page.getByText('AI grammar issues shown: 1/1')).toBeVisible();
      await expect(
        page.getByText('Use a more precise verb in this sentence.')
      ).toBeVisible();

      const updated = await prisma.submission.findUniqueOrThrow({
        where: { id: e2eContext.submittedSubmissionId },
        select: { aiMeta: true },
      });
      expect(updated.aiMeta).toMatchObject({
        gradingAssistantTemplateId: 'gait_thesis_current_v1',
        gradingAssistantTemplateSlug: 'thesis-driven-essay-current',
        gradingAssistantSource: 'legacy-fallback',
      });
    } finally {
      await prisma.$disconnect();
    }
  });
});
