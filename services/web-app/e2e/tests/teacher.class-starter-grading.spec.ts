import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import type { E2EContext } from '../seed-e2e';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const CLASS_STARTER_POINTS = 5;

async function createClassStarterSubmission(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { assignment, classAssignment } = await createDeployedAssignment({
      prisma,
      classId: e2eContext.classId,
      assignmentTypeId: e2eContext.classStarterAssignmentTypeId,
      title: `Class Starter e2e ${suffix}`,
      prompt: 'Write freely for ten minutes about something you noticed today.',
      pointValue: CLASS_STARTER_POINTS,
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
    const fixture = await createClassStarterSubmission(e2eContext);
    documentId = fixture.documentId;
    submissionId = fixture.submissionId;

    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/submissions/${submissionId}`);
    await page.waitForLoadState('networkidle');

    const engagementScore = page.getByTestId(
      'grading-rubric-score-engagement_with_prompt'
    );
    const engagementTrigger = page.getByRole('button', {
      name: /^Engagement with Prompt/,
    });
    await expect(engagementTrigger).toContainText('Not scored');
    await engagementTrigger.click();
    await expect(engagementScore).toBeVisible();
    await expect(page.getByTestId(/^grading-rubric-score-/)).toHaveCount(1);

    await expect(
      page.getByTestId('grading-rubric-comment-engagement_with_prompt')
    ).toHaveCount(0);
    await expect(page.getByTestId('grading-overall-comment')).toBeVisible();

    await engagementScore.click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await listbox
      .getByRole('option', { name: 'Not Present', exact: true })
      .click();
    await expect(
      page.getByText(`Not Present (0/${CLASS_STARTER_POINTS})`)
    ).toBeVisible();

    await expect(page.getByText(/grammar\/syntax issues/i)).toHaveCount(0);
    await expect(page.getByText(/AI grammar issues:/i)).toHaveCount(0);

    await page.getByTestId('grading-assistant-generate').click();
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
    await expect(
      page.getByText(`Excellent (${CLASS_STARTER_POINTS}/${CLASS_STARTER_POINTS})`)
    ).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText(/AI grammar issues:/i)).toHaveCount(0);

    const grade = await readGrade(submissionId);
    expect(grade.rubricScores).toMatchObject({
      engagement_with_prompt: { score: CLASS_STARTER_POINTS, isAi: true },
    });
    expect(
      Object.keys(grade.rubricScores as Record<string, unknown>)
    ).toEqual(['engagement_with_prompt']);
    expect(grade.overallComment).toBeTruthy();
    expect(grade.score).toBe(
      `${CLASS_STARTER_POINTS}/${CLASS_STARTER_POINTS}`
    );
    expect(grade.numericPercentage).toBeNull();
    expect(grade.letterGrade).toBeNull();
    expect(grade.grammarIssues).toEqual({ version: 1, issues: [] });
  });
});
