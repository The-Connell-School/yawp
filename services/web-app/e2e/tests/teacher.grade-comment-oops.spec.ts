import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe('Teacher grade comment crash regression', () => {
  test('existing grade comments must render without the oops screen', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      const submission = await prisma.submission.findUniqueOrThrow({
        where: { id: e2eContext.submittedSubmissionId },
        select: { id: true, text: true },
      });
      const excerpt = (submission.text ?? '').slice(0, 28).trim();
      expect(excerpt.length).toBeGreaterThan(0);

      const uniqueContent = `Seeded grade comment ${Date.now()}`;
      await prisma.submissionComment.create({
        data: {
          submissionId: submission.id,
          membershipId: e2eContext.teacherMembershipId,
          content: uniqueContent,
          excerpt,
          occurrence: 1,
        },
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/submissions/${e2eContext.submittedSubmissionId}?edit=1`
      );
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(uniqueContent).first()).toBeVisible({
        timeout: 10000,
      });
      await expect(
        page.getByText(/Oops! Something didn't work quite right/i)
      ).toHaveCount(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('saving a grade comment must not show the oops screen', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(
      `/app/submissions/${e2eContext.submittedSubmissionId}?edit=1`
    );
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      const essayRoot = document.querySelector('.submission-essay');
      if (!essayRoot) return;
      const text = essayRoot.textContent ?? '';
      const excerpt = text.slice(0, 28).trim();
      if (!excerpt) return;
      window.dispatchEvent(
        new CustomEvent('grading-comment-request', {
          detail: { excerpt, occurrence: 1 },
        })
      );
    });
    const uniqueContent = `Grade comment oops regression ${Date.now()}`;
    const commentTextarea = page.locator(
      'textarea[placeholder="Write your comment..."]'
    );
    await commentTextarea.fill(uniqueContent);
    // Scope to the comment draft's own Save button — the lifecycle panel
    // also has a "Save" button on this page.
    const commentDraft = commentTextarea.locator(
      'xpath=ancestor::div[contains(@class, "border-dashed")][1]'
    );
    await commentDraft.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText(uniqueContent).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/Oops! Something didn't work quite right/i)).toHaveCount(
      0
    );

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(uniqueContent).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/Oops! Something didn't work quite right/i)).toHaveCount(
      0
    );
  });
});
