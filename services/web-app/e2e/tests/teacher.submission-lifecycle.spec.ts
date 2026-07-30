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

  test('needs grading: no edit/view toggle, only Save + Grading Assistant Suggestions', async ({
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

    // No Edit/View toggle in the needs-grading state.
    await expect(panel.getByTestId('submission-lifecycle-edit')).toHaveCount(
      0
    );
    await expect(
      panel.getByRole('button', { name: /^view$/i })
    ).toHaveCount(0);

    // Save is the header action, and the grading form is always shown.
    await expect(
      panel.getByTestId('submission-lifecycle-save')
    ).toBeVisible();
    await expect(page.getByTestId('grading-assistant-generate')).toBeVisible();

    // The top-right nav never has a Release Grade button — that action now
    // lives exclusively in the lifecycle panel once graded.
    const navReleaseButton = page
      .locator('nav')
      .getByRole('button', { name: /release grade/i });
    await expect(navReleaseButton).toHaveCount(0);

    await page.getByTestId('grading-assistant-generate').click();
    await expect(
      page.getByTestId('grading-overall-comment')
    ).not.toHaveValue('', { timeout: 20000 });

    await panel.getByTestId('submission-lifecycle-save').click();
    await page.waitForLoadState('networkidle');

    // After Save, the panel moves to the Graded state's default read-only view.
    await expect(panel.getByTestId('submission-lifecycle-edit')).toBeVisible();
    await expect(
      panel.getByTestId('submission-lifecycle-save')
    ).toHaveCount(0);
    await expect(
      panel.getByTestId('submission-lifecycle-release')
    ).toBeVisible();
    await expect(
      page.getByText(
        'these legacy grading assistant suggestions still apply.'
      )
    ).toBeVisible();
    // Release now lives in the panel, not the top-right nav.
    await expect(navReleaseButton).toHaveCount(0);
  });

  test('graded: Edit reveals the form and regenerating suggestions still works, then Release locks it', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/submissions/${submissionId}`);
    await page.waitForLoadState('networkidle');

    const panel = page.getByTestId('submission-lifecycle-panel');

    // Defaults to read-only view for an already-graded, unreleased submission.
    await expect(panel.getByTestId('submission-lifecycle-edit')).toBeVisible();
    await expect(
      page.getByTestId('grading-overall-comment')
    ).toHaveCount(0);
    // Release is only ever offered from the lifecycle panel, not the nav.
    await expect(
      page.locator('nav').getByRole('button', { name: /release grade/i })
    ).toHaveCount(0);
    await expect(panel.getByTestId('submission-lifecycle-release')).toBeVisible();

    await panel.getByTestId('submission-lifecycle-edit').click();
    await expect(page.getByTestId('grading-overall-comment')).toBeVisible();
    await expect(
      panel.getByTestId('submission-lifecycle-save')
    ).toBeVisible();

    // Regenerating suggestions replaces the existing draft (confirmation required).
    const generateButton = page.getByTestId('grading-assistant-generate');
    await generateButton.click();
    await page.getByRole('button', { name: /^replace$/i }).click();
    await expect(generateButton).toContainText('Grading Assistant Suggestions', {
      timeout: 20000,
    });
    await expect(
      page.getByTestId('grading-overall-comment')
    ).not.toHaveValue('');

    await panel.getByTestId('submission-lifecycle-save').click();
    await expect(page.getByTestId('grading-overall-comment')).toHaveCount(0);
    await expect(panel.getByTestId('submission-lifecycle-edit')).toBeVisible();

    // Release the grade from the lifecycle panel (top-right button is gone).
    await panel.getByTestId('submission-lifecycle-release').click();
    await expect(
      page.getByRole('alertdialog', { name: /release grade/i })
    ).toBeVisible();
    await page.getByRole('button', { name: /^release$/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(
      panel.getByTestId('submission-lifecycle-edit')
    ).toHaveCount(0);
    await expect(
      panel.getByTestId('submission-lifecycle-release')
    ).toHaveCount(0);

    // Locked even after reload, and ?edit=1 can no longer force edit mode.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(
      panel.getByTestId('submission-lifecycle-edit')
    ).toHaveCount(0);
    await expect(page.getByTestId('grading-overall-comment')).toHaveCount(0);

    await page.goto(`/app/submissions/${submissionId}?edit=1`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('grading-overall-comment')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /release grade/i })
    ).toHaveCount(0);
  });
});
