import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import type { E2EContext } from '../seed-e2e';

const TEACHER_PASSWORD = 'teacher-e2e-password';

const RUBRIC_KEYS = [
  'thesis_and_content',
  'organization_and_structure',
  'evidence_and_support',
  'voice_and_style',
  'grammar_and_mechanics',
] as const;

const RUBRIC_LABELS: Record<(typeof RUBRIC_KEYS)[number], RegExp> = {
  thesis_and_content: /Thesis\/Content/i,
  organization_and_structure: /Organization\/Structure/i,
  evidence_and_support: /Evidence\/Support/i,
  voice_and_style: /Voice\/Style/i,
  grammar_and_mechanics: /Grammar\/Syntax\/Formatting/i,
};

async function createNeedsGradingFixture(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const text = `Recalculate e2e essay body ${suffix}. This essay has enough words for grading to make sense.`;
    const html = `<p>${text}</p>`;
    const document = await prisma.document.create({
      data: {
        title: `Recalculate e2e document ${suffix}`,
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
        title: `Recalculate e2e submission ${suffix}`,
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

test.describe.serial('Teacher grading: recalculate overall grade from rubric', () => {
  let documentId: string;
  let submissionId: string;

  test.afterAll(async () => {
    if (documentId) await deleteFixtureDocument(documentId);
  });

  test('link below the overall grade recomputes it from rubric scores without touching rubric or comments', async ({
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

    // Score every rubric category as a perfect 5, which computes to 100%.
    for (const key of RUBRIC_KEYS) {
      await page
        .getByRole('button', { name: RUBRIC_LABELS[key] })
        .click();
      await page.getByTestId(`grading-rubric-score-${key}`).click();
      await page.getByRole('option', { name: /^5\s+-\s+/i }).click();
      await page
        .getByTestId(`grading-rubric-comment-${key}`)
        .fill(`Rubric comment for ${key} that must survive recalculation.`);
    }

    const overallCommentText =
      'Overall feedback that must survive recalculation.';
    await page
      .getByTestId('grading-overall-comment')
      .fill(overallCommentText);

    // Manually override the overall percentage to something that disagrees
    // with the rubric total (100 for five perfect category scores).
    const pctInput = page.getByTestId('grading-overall-percentage');
    await pctInput.fill('60');
    await expect(pctInput).toHaveValue('60');

    const panel = page.getByTestId('submission-lifecycle-panel');
    await panel.getByTestId('submission-lifecycle-save').click();
    await page.waitForLoadState('networkidle');
    await expect(
      panel.getByTestId('submission-lifecycle-release')
    ).toBeVisible();

    // Re-enter edit mode: the saved overall percentage is the manual 60%.
    await panel.getByTestId('submission-lifecycle-edit').click();
    await expect(pctInput).toHaveValue('60');

    // Rubric categories collapse on remount; expand them to inspect their
    // saved comments before and after recalculating.
    for (const key of RUBRIC_KEYS) {
      await page.getByRole('button', { name: RUBRIC_LABELS[key] }).click();
    }

    const recalcLink = page.getByTestId('grading-recalculate-from-rubric');
    await expect(recalcLink).toBeVisible();

    await recalcLink.click();

    // The overall percentage now matches the rubric total...
    await expect(pctInput).toHaveValue('100');
    // ...while rubric comments and overall feedback are untouched.
    await expect(page.getByTestId('grading-overall-comment')).toHaveValue(
      overallCommentText
    );
    for (const key of RUBRIC_KEYS) {
      await expect(
        page.getByTestId(`grading-rubric-comment-${key}`)
      ).toHaveValue(`Rubric comment for ${key} that must survive recalculation.`);
    }

    // Nothing is persisted until Save is pressed: Cancel discards the
    // recalculation and the reopened panel shows the saved manual 60% again.
    await panel.getByTestId('submission-lifecycle-cancel').click();
    await panel.getByTestId('submission-lifecycle-edit').click();
    await expect(pctInput).toHaveValue('60');

    // Recalculate again and this time persist it.
    await recalcLink.click();
    await expect(pctInput).toHaveValue('100');
    await panel.getByTestId('submission-lifecycle-save').click();
    await page.waitForLoadState('networkidle');

    await expect(
      panel.getByTestId('submission-lifecycle-release')
    ).toBeVisible();
    await panel.getByTestId('submission-lifecycle-edit').click();
    await expect(pctInput).toHaveValue('100');
  });
});
