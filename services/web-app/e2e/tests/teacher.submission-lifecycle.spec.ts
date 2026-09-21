import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import type { E2EContext } from '../seed-e2e';

const TEACHER_PASSWORD = 'teacher-e2e-password';

async function createNeedsGradingFixture(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const text = `Lifecycle panel e2e essay body ${suffix}. This essay has enough words for the grading assistant to evaluate meaningfully.`;
    const html = `<p>${text}</p>`;
    const document = await prisma.document.create({
      data: {
        title: `Lifecycle panel e2e document ${suffix}`,
        text,
        html,
        membershipId: e2eContext.membershipId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        assignmentId: e2eContext.assignmentId,
        classAssignmentId: e2eContext.classAssignmentId,
      },
      select: { id: true },
    });
    const submission = await prisma.submission.create({
      data: {
        documentId: document.id,
        html,
        text,
        title: `Lifecycle panel e2e submission ${suffix}`,
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

test.describe.serial('Teacher submission lifecycle panel', () => {
  let documentId: string;
  let submissionId: string;

  test.afterAll(async () => {
    if (documentId) await deleteFixtureDocument(documentId);
  });

  test('needs grading: Save stays disabled until there is draft content', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const fixture = await createNeedsGradingFixture(e2eContext);
    documentId = fixture.documentId;
    submissionId = fixture.submissionId;

    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/submissions/${submissionId}`);
    await page.waitForLoadState('networkidle');

    const panel = page.getByTestId('submission-lifecycle-panel');
    await expect(panel).toBeVisible();

    await expect(panel.getByTestId('submission-lifecycle-edit')).toHaveCount(0);
    await expect(page.getByTestId('grading-assistant-generate')).toBeVisible();

    const saveButton = panel.getByTestId('submission-lifecycle-save');
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeDisabled();

    await page.getByTestId('grading-overall-points').fill('88');

    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await page.waitForLoadState('networkidle');

    await expect(
      panel.getByTestId('submission-lifecycle-release')
    ).toBeVisible();
    await expect(panel.getByTestId('submission-lifecycle-edit')).toBeVisible();
    await expect(page.getByTestId('grading-assistant-generate')).toHaveCount(0);
    await expect(page.getByTestId('grading-overall-comment')).toHaveCount(0);
    await expect(panel.getByText('Overall Grade')).toBeVisible();

    // Finalization advances Submission.updatedAt after the draft save. Reopen
    // immediately, without navigation or reload, to prove the revalidation
    // picked up that authoritative revision before the next write.
    await panel.getByTestId('submission-lifecycle-edit').click();
    await page
      .getByTestId('grading-overall-comment')
      .fill('Immediate post-finalization edit persisted.');
    await panel.getByTestId('submission-lifecycle-save').click();
    await expect(
      panel.getByText('Immediate post-finalization edit persisted.')
    ).toBeVisible();
  });

  test('graded: ready-to-release view with edit flow and release', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/submissions/${submissionId}`);
    await page.waitForLoadState('networkidle');

    const panel = page.getByTestId('submission-lifecycle-panel');

    await expect(
      panel.getByTestId('submission-lifecycle-release')
    ).toBeVisible();
    await expect(panel.getByTestId('submission-lifecycle-edit')).toBeVisible();
    await expect(page.getByTestId('grading-assistant-generate')).toHaveCount(0);

    await panel.getByTestId('submission-lifecycle-edit').click();
    await expect(page.getByTestId('grading-assistant-generate')).toBeVisible();
    await expect(page.getByTestId('grading-overall-comment')).toBeVisible();

    const generateButton = page.getByTestId('grading-assistant-generate');
    await generateButton.click();
    await page.getByRole('button', { name: /^replace$/i }).click();
    await expect(generateButton).toContainText(
      'Grading Assistant Suggestions',
      {
        timeout: 20000,
      }
    );
    await expect(panel.getByTestId('submission-lifecycle-cancel')).toHaveText(
      'Done'
    );

    await panel.getByTestId('submission-lifecycle-cancel').click();
    await expect(page.getByTestId('grading-assistant-generate')).toHaveCount(0);
    await expect(
      panel.getByTestId('submission-lifecycle-release')
    ).toBeVisible();

    await panel.getByTestId('submission-lifecycle-edit').click();
    await expect(panel.getByTestId('submission-lifecycle-cancel')).toHaveText(
      'Done'
    );
    await panel.getByTestId('submission-lifecycle-cancel').click();
    await expect(
      panel.getByTestId('submission-lifecycle-release')
    ).toBeVisible();

    await panel.getByTestId('submission-lifecycle-release').click();
    const releaseDialog = page.getByRole('alertdialog', {
      name: /release grade/i,
    });
    await expect(releaseDialog).toBeVisible();
    await releaseDialog.getByRole('button', { name: /^release$/i }).click();
    await expect(panel.getByTestId('submission-lifecycle-release')).toHaveCount(
      0,
      {
        timeout: 15000,
      }
    );
    await expect(page.getByTestId('grading-assistant-generate')).toHaveCount(0);
    await expect(
      panel.getByTestId('grade-summary-released-label')
    ).toBeVisible();
    await expect(panel.getByTestId('grade-summary-released-label')).toHaveText(
      'Released'
    );
  });
});
