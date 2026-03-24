import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import {
  ensureDocumentSubmitted,
  setDocumentSubmissionForSchool,
} from '../db-helpers';

function buildAiSuggestionPayload() {
  return {
    success: true,
    message: 'Grading Assistant suggestions generated.',
    rubricScores: {
      thesis_and_content: {
        score: 4,
        comment: 'Clear thesis with room for deeper analysis.',
        isAi: true,
      },
      organization_and_structure: {
        score: 4,
        comment: 'Logical structure with mostly smooth transitions.',
        isAi: true,
      },
      evidence_and_support: {
        score: 3,
        comment: 'Some evidence is present but needs tighter explanation.',
        isAi: true,
      },
      voice_and_style: {
        score: 4,
        comment: 'Voice is confident and readable.',
        isAi: true,
      },
      grammar_and_mechanics: {
        score: 3,
        comment: 'A few grammar issues reduce clarity.',
        isAi: true,
      },
    },
    overallComment:
      'Martha, your draft has a clear direction and strong voice; next, develop your evidence more fully.',
    numericPercentage: 77,
    letterGrade: 'C',
    score: '77% (C)',
    grammarIssues: {
      version: 1,
      issues: [
        {
          id: 'issue-1',
          excerpt: 'This are',
          occurrence: 1,
          kind: 'error',
          message: 'Subject-verb agreement issue.',
        },
      ],
    },
  };
}

test.describe.serial('Teacher grading autosave', () => {
  test('autosaves grading edits and keeps grading state when saving grade comments', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();

    try {
      await setDocumentSubmissionForSchool({
        prisma,
        schoolId: e2eContext.schoolId,
        enabled: true,
      });

      const snapshotId = await ensureDocumentSubmitted({
        prisma,
        documentId: e2eContext.documentId,
      });

      await prisma.grade.deleteMany({ where: { snapshotId } });
      const gradingProfile = await prisma.profile.findFirstOrThrow({
        where: { user: { email: e2eContext.teacherEmail } },
        select: { id: true },
      });
      const aiSeed = buildAiSuggestionPayload();
      await prisma.grade.create({
        data: {
          documentId: e2eContext.documentId,
          snapshotId,
          gradedById: gradingProfile.id,
          feedback: aiSeed.overallComment,
          overallComment: aiSeed.overallComment,
          rubricScores: aiSeed.rubricScores as any,
          numericPercentage: aiSeed.numericPercentage,
          letterGrade: aiSeed.letterGrade,
          score: aiSeed.score,
          grammarIssues: aiSeed.grammarIssues as any,
        },
      });
      const seededGrade = await (prisma as any).grade.findUnique({
        where: { snapshotId },
        select: { overallComment: true },
      });
      expect(seededGrade?.overallComment).toContain('Martha,');

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

      await page.goto(
        `/app/documents/${e2eContext.documentId}?left=grading&tab=editor&snapshotId=${snapshotId}`
      );
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('grading-overall-comment')).toBeVisible({
        timeout: 10000,
      });

      await expect(page.getByTestId('grading-save-grade')).toHaveCount(0);
      await expect(page.getByTestId('grading-save-status')).toBeVisible({
        timeout: 10000,
      });

      const marker =
        ' AUTOSAVE_MARKER should still be present after saving a right-column comment.';
      await page
        .getByTestId('grading-overall-comment')
        .fill(
          `Martha, your draft has a clear direction and strong voice; next, develop your evidence more fully.${marker}`
        );

      await page.evaluate(() => {
        window.dispatchEvent(
          new CustomEvent('grading-comment-request', {
            detail: { excerpt: 'This are a practice essay', occurrence: 1 },
          })
        );
      });
      await page
        .locator('textarea[placeholder="Write your comment..."]')
        .fill('First right-column comment.');
      await page
        .locator('[data-grade-comment-card="draft"]')
        .getByRole('button', { name: /^save$/i })
        .click();

      await expect(page.getByText('First right-column comment.')).toBeVisible({
        timeout: 10000,
      });
      await expect(
        page.locator('[data-grade-comment-card="draft"]')
      ).toHaveCount(0);
      await expect(page.getByTestId('grading-overall-comment')).toHaveValue(
        new RegExp(marker)
      );

      const navType = await page.evaluate(() => {
        const nav = performance.getEntriesByType(
          'navigation'
        )[0] as PerformanceNavigationTiming | undefined;
        return nav?.type ?? 'unknown';
      });
      expect(navType).not.toBe('reload');

      await page.evaluate(() => {
        window.dispatchEvent(
          new CustomEvent('grading-comment-request', {
            detail: {
              excerpt: 'The students was excited for writing.',
              occurrence: 1,
            },
          })
        );
      });
      await expect(
        page.locator('[data-grade-comment-card="draft"]')
      ).toHaveCount(1);
      await page
        .locator('textarea[placeholder="Write your comment..."]')
        .fill('Second right-column comment.');
      await page
        .locator('[data-grade-comment-card="draft"]')
        .getByRole('button', { name: /^save$/i })
        .click();

      await expect(page.getByText('Second right-column comment.')).toBeVisible({
        timeout: 10000,
      });

      await expect
        .poll(
          async () => {
            const grade = await (prisma as any).grade.findUnique({
              where: { snapshotId },
              select: {
                overallComment: true,
              },
            });
            return grade?.overallComment ?? null;
          },
          { timeout: 15000 }
        )
        .toContain('AUTOSAVE_MARKER');
    } finally {
      await prisma.$disconnect();
    }
  });
});
