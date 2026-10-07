import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';

test('holistic Cristo Rey rubric grades points-only through grade-essay-ai', async ({
  page,
  e2eContext,
  signIn,
}, testInfo) => {
  test.setTimeout(180_000);
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

  try {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/submissions/${submission.id}`);

    const panel = page.getByTestId('submission-lifecycle-panel');
    await expect(page.getByTestId('grading-assistant-generate')).toBeVisible({
      timeout: 30_000,
    });
    const gradingResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/grade-essay-ai') &&
        response.request().method() === 'POST' &&
        response.status() === 200,
      { timeout: 120_000 }
    );
    await page.getByTestId('grading-assistant-generate').click();
    await gradingResponse;

    const afterAssistant = await prisma.submission.findUniqueOrThrow({
      where: { id: submission.id },
    });
    expect(afterAssistant.score).toMatch(/^\d+\/20$/);
    expect(afterAssistant.numericPercentage).toBeNull();
    const pointsLabel = afterAssistant.score!.replace('/', ' / ');
    await expect(panel.getByText(pointsLabel, { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({
      path: testInfo.outputPath('holistic-teacher-before-save.png'),
      fullPage: true,
    });

    await panel.getByTestId('submission-lifecycle-save').click();
    await expect(panel.getByText(pointsLabel, { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('holistic-teacher-after-save.png'),
      fullPage: true,
    });

    await panel.getByTestId('submission-lifecycle-release').click();
    await expect(panel.getByTestId('grade-summary-released-label')).toBeVisible();

    const graded = await prisma.submission.findUniqueOrThrow({
      where: { id: submission.id },
    });
    const aiMeta = graded.aiMeta as Record<string, unknown>;
    expect(aiMeta.scoringMode).toBe('holistic_tier');
    expect(graded.numericPercentage).toBeNull();
    expect(graded.score).toMatch(/^\d+\/20$/);
    const holistic = aiMeta.holistic as Record<string, unknown>;
    expect(holistic.totalPoints).toBe(20);
    expect(holistic.storedPoints).toBe(
      Number.parseInt(graded.score!.split('/')[0]!, 10)
    );

    await signIn('jdoe@brock.software', 'johndoe');
    await page.goto(`/app/submissions/${submission.id}`);
    await expect(page.getByText(pointsLabel, { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('holistic-student-view.png'),
      fullPage: true,
    });

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/my-classes/${e2eContext.classId}?tab=documents&status=released`
    );
    await expect(page.getByText(new RegExp(pointsLabel.replace(' ', '\\s*')))).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('holistic-gradebook-row.png'),
      fullPage: true,
    });
  } finally {
    await prisma.$disconnect();
  }
});
