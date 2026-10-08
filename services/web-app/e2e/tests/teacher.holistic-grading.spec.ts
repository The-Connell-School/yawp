/** Holistic Cristo Rey smoke: grade-essay-ai on a 20-point assignment type. */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';

let holisticSubmissionId: string;
let holisticClassId: string;

test.describe.serial('holistic Cristo Rey points-only grading', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.document.documentElement.setAttribute(
        'data-e2e-force-grading-fixture',
        'true'
      );
    });
  });

  test('teacher grades with fixture and releases points-only', async ({
    page,
    e2eContext,
    signIn,
  }, testInfo) => {
    test.setTimeout(300_000);
    const prisma = createE2EPrismaClient();
    const title = `Holistic E2E ${Date.now()}`;
    const { assignment, classAssignment } = await createDeployedAssignment({
      prisma,
      classId: e2eContext.classId,
      assignmentTypeId: e2eContext.holisticEssayAssignmentTypeId,
      title,
      prompt:
        'Analyze how the author uses a symbol to develop a theme in the assigned text.',
      submitForGrade: true,
      pointValue: 20,
    });
    const essayText =
      'In the novel, the green light symbolizes Gatsby’s longing. The author repeats the image at the dock and in the closing lines to show how hope outlasts loss.';
    const essayHtml = `<p>${essayText}</p>`;
    const document = await prisma.document.create({
      data: {
        title,
        text: essayText,
        html: essayHtml,
        membershipId: e2eContext.membershipId,
        assignmentTypeId: e2eContext.holisticEssayAssignmentTypeId,
        assignmentId: assignment.id,
        classAssignmentId: classAssignment.id,
      },
    });
    const submission = await prisma.submission.create({
      data: {
        documentId: document.id,
        title,
        text: essayText,
        html: essayHtml,
        submittedAt: new Date(),
      },
    });
    holisticSubmissionId = submission.id;
    holisticClassId = e2eContext.classId;

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/submissions/${submission.id}`);

      const panel = page.getByTestId('submission-lifecycle-panel');
      const generateButton = panel.getByTestId('grading-assistant-generate');
      await expect(generateButton).toBeEnabled({ timeout: 60_000 });
      await generateButton.click();
      const replaceButton = page.getByRole('button', { name: /^replace$/i });
      if (await replaceButton.isVisible().catch(() => false)) {
        await replaceButton.click();
      }
      await expect
        .poll(
          async () => {
            const row = await prisma.submission.findUnique({
              where: { id: submission.id },
              select: { score: true },
            });
            return row?.score ?? '';
          },
          { timeout: 120_000 }
        )
        .toBe('18/20');

      const gradedAfterAssistant = await prisma.submission.findUniqueOrThrow({
        where: { id: submission.id },
      });
      expect(gradedAfterAssistant.numericPercentage).toBeNull();
      await expect(generateButton).toContainText(
        'Grading Assistant Suggestions',
        { timeout: 120_000 }
      );
      await page.screenshot({
        path: testInfo.outputPath('holistic-teacher-before-save.png'),
        fullPage: true,
      });

      await panel.getByTestId('submission-lifecycle-cancel').click();
      await expect(
        panel.getByTestId('submission-lifecycle-release')
      ).toBeVisible({ timeout: 30_000 });

      await panel.getByTestId('submission-lifecycle-edit').click();
      const pointsInput = page.getByTestId('grading-overall-points');
      await expect(pointsInput).toBeVisible({ timeout: 15_000 });
      await pointsInput.fill('6');
      await pointsInput.blur();
      await panel.getByTestId('submission-lifecycle-save').click();
      await expect
        .poll(
          async () => {
            const row = await prisma.submission.findUnique({
              where: { id: submission.id },
              select: {
                score: true,
                numericPercentage: true,
                letterGrade: true,
              },
            });
            return row;
          },
          { timeout: 60_000 }
        )
        .toMatchObject({
          score: '6/20',
          numericPercentage: null,
          letterGrade: null,
        });
      await expect(page.getByText(/\d+\s*%/)).not.toBeVisible();
      await expect(page.getByText(/\(F\)/i)).not.toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('holistic-teacher-after-save.png'),
        fullPage: true,
      });

      await panel.getByTestId('submission-lifecycle-release').click();
      const releaseDialog = page.getByRole('alertdialog', {
        name: /release grade/i,
      });
      await releaseDialog.getByRole('button', { name: /^release$/i }).click();
      await expect(
        panel.getByTestId('grade-summary-released-label')
      ).toBeVisible({ timeout: 30_000 });

      const graded = await prisma.submission.findUniqueOrThrow({
        where: { id: submission.id },
      });
      const aiMeta = graded.aiMeta as Record<string, unknown>;
      expect(aiMeta.scoringMode).toBe('holistic_tier');
      expect(graded.numericPercentage).toBeNull();
      expect(graded.letterGrade).toBeNull();
      expect(graded.score).toBe('6/20');
      expect((aiMeta.holistic as Record<string, unknown>).totalPoints).toBe(20);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('student submission view shows points without percent', async ({
    page,
    e2eContext,
    signIn,
  }, testInfo) => {
    test.setTimeout(120_000);
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/submissions/${holisticSubmissionId}`);
    await expect(page.getByText(/6\s*\/\s*20/)).toBeVisible();
    await expect(page.getByText(/\d+\s*%/)).not.toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('holistic-student-view.png'),
      fullPage: true,
    });
  });

  test('class documents list shows released holistic points', async ({
    page,
    e2eContext,
    signIn,
  }, testInfo) => {
    test.setTimeout(120_000);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/my-classes/${holisticClassId}?tab=documents&status=released`
    );
    await expect(page.getByText(/6\s*\/\s*20/)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('holistic-gradebook-row.png'),
      fullPage: true,
    });
  });
});
