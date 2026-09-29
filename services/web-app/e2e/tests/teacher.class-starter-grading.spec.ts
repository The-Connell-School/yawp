import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import type { E2EContext } from '../seed-e2e';

const TEACHER_PASSWORD = 'teacher-e2e-password';

async function createDailyPagesSubmission(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { assignment, classAssignment } = await createDeployedAssignment({
      prisma,
      classId: e2eContext.classId,
      assignmentTypeId: e2eContext.classStarterAssignmentTypeId,
      title: `Class Starter e2e ${suffix}`,
      prompt: 'Write freely for ten minutes about something you noticed today.',
    });

    const text = `Class Starter entry ${suffix}. I kept writing past the point where I wanted to stop, and the thought went somewhere I did not expect.`;
    const html = `<p>${text}</p>`;
    const document = await prisma.document.create({
      data: {
        title: `Class Starter document ${suffix}`,
        text,
        html,
        membershipId: e2eContext.membershipId,
        assignmentTypeId: e2eContext.classStarterAssignmentTypeId,
        assignmentId: assignment.id,
        classAssignmentId: classAssignment.id,
      },
      select: { id: true },
    });
    const submission = await prisma.submission.create({
      data: {
        documentId: document.id,
        html,
        text,
        title: `Class Starter submission ${suffix}`,
        submittedAt: new Date(),
      },
      select: { id: true },
    });

    return { documentId: document.id, submissionId: submission.id };
  } finally {
    await prisma.$disconnect();
  }
}

async function deleteFixtureDocument(documentId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.document.delete({ where: { id: documentId } });
  } catch {
    // best-effort cleanup; don't fail the suite over teardown issues
  } finally {
    await prisma.$disconnect();
  }
}

async function readGrade(submissionId: string) {
  const prisma = createE2EPrismaClient();
  try {
    return await prisma.submission.findUniqueOrThrow({
      where: { id: submissionId },
      select: {
        rubricScores: true,
        overallComment: true,
        score: true,
        numericPercentage: true,
        letterGrade: true,
        grammarIssues: true,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Teacher grading: a Class Starter submission', () => {
  let documentId: string;
  let submissionId: string;

  test.afterAll(async () => {
    if (documentId) await deleteFixtureDocument(documentId);
  });

  test('grades engagement alone, with overall feedback and no grammar markup', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const fixture = await createDailyPagesSubmission(e2eContext);
    documentId = fixture.documentId;
    submissionId = fixture.submissionId;

    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/submissions/${submissionId}`);
    await page.waitForLoadState('networkidle');

    // One category, and it is engagement.
    const engagementScore = page.getByTestId('grading-rubric-score-engagement');
    // The accordion trigger reads "Engagement" plus its current score.
    const engagementTrigger = page.getByRole('button', {
      name: /^Engagement/,
    });
    await expect(engagementTrigger).toContainText('Not scored');
    await engagementTrigger.click();
    await expect(engagementScore).toBeVisible();
    await expect(page.getByTestId(/^grading-rubric-score-/)).toHaveCount(1);

    // Overall feedback only: engagement has no feedback box of its own.
    await expect(
      page.getByTestId('grading-rubric-comment-engagement')
    ).toHaveCount(0);
    await expect(page.getByTestId('grading-overall-comment')).toBeVisible();

    // The four words Class Starter scores on, including Absent as a real 0.
    // The grading panel names each band by its word alone.
    await engagementScore.click();
    for (const label of ['Absent', 'Hardly there', 'Showed up', 'All in']) {
      await expect(
        page.getByRole('option', { name: label, exact: true })
      ).toBeVisible();
    }
    await page.getByRole('option', { name: 'Absent', exact: true }).click();
    // Absent is a judgment, not a blank.
    await expect(page.getByText('Absent (0/3)')).toBeVisible();

    // No grammar or syntax markup anywhere on the panel.
    await expect(page.getByText(/grammar\/syntax issues/i)).toHaveCount(0);
    await expect(page.getByText(/AI grammar issues:/i)).toHaveCount(0);

    await page.getByTestId('grading-assistant-generate').click();
    // The Absent chosen above is teacher feedback, so the assistant asks
    // before replacing it.
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/domain/grade-essay-ai') &&
        response.request().method() === 'POST' &&
        response.status() === 200,
      { timeout: 60000 }
    );

    await expect(page.getByTestId('grading-overall-comment')).not.toHaveValue(
      '',
      { timeout: 30000 }
    );
    await expect(page.getByText('All in (3/3)')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText(/AI grammar issues:/i)).toHaveCount(0);

    const grade = await readGrade(submissionId);
    expect(grade.rubricScores).toMatchObject({
      engagement: { score: 3, isAi: true },
    });
    expect(Object.keys(grade.rubricScores as Record<string, unknown>)).toEqual([
      'engagement',
    ]);
    expect(grade.overallComment).toBeTruthy();
    // Points out of three, never a percentage or a letter.
    expect(grade.score).toBe('3/3');
    expect(grade.numericPercentage).toBeNull();
    expect(grade.letterGrade).toBeNull();
    // The grammar pass never ran, so it left an empty issue set behind.
    expect(grade.grammarIssues).toEqual({ version: 1, issues: [] });
  });
});
