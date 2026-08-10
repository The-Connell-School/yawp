import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const TEACHER_EMAIL = 'teacher.e2e@yawp.test';
const TEACHER_PASSWORD = 'teacher-e2e-password';

async function clearCachedInsight(classAssignmentId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.classAssignmentInsight.deleteMany({
      where: { classAssignmentId },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('teacher assignment-level class insights', () => {
  test('generates a class performance summary on demand', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await clearCachedInsight(e2eContext.classAssignmentId);
    await signIn(TEACHER_EMAIL, TEACHER_PASSWORD);

    // Reach the per-assignment page the way a teacher would: from the class
    // Documents tab scoped to a single assignment, via the summary entry
    // link — which opens the dedicated class summary full page (nested
    // under the class detail route), not the old standalone
    // /assignments/:id page.
    await page.goto(
      `/app/my-classes/${e2eContext.classId}?tab=documents&classAssignmentId=${e2eContext.classAssignmentId}`
    );
    await page
      .getByRole('link', { name: /class performance summary/i })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/summary/${e2eContext.assignmentId}`)
    );

    // The panel is present but empty until the teacher asks for a summary.
    const panel = page.getByRole('heading', {
      name: /class performance summary/i,
    });
    await expect(panel).toBeVisible();

    const generateButton = page.getByRole('button', {
      name: /summarize class performance/i,
    });
    await expect(generateButton).toBeVisible();
    await generateButton.click();

    // The deterministic E2E fixture returns an overview, per-category calls,
    // and at least one rubric-tagged next step.
    await expect(page.getByText(/how the class did/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/suggested next steps/i)).toBeVisible();
    await expect(page.getByText(/based on \d+ submissions/i)).toBeVisible();

    // A fresh summary starts the regeneration cooldown, so the action is hidden
    // and the subtitle carries the reason it cannot run yet.
    await expect(
      page.getByTestId('class-insight-panel-subtitle')
    ).toContainText(/regenerate in \d+ (hours|minutes)/i);
    await expect(page.getByRole('button', { name: /regenerate/i })).toHaveCount(
      0
    );
  });

  test('cached summary is shown on reload', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await clearCachedInsight(e2eContext.classAssignmentId);
    await signIn(TEACHER_EMAIL, TEACHER_PASSWORD);

    const assignmentUrl = `/app/my-classes/${e2eContext.classId}/assignments/${e2eContext.assignmentId}`;
    await page.goto(assignmentUrl);

    const generateButton = page.getByRole('button', {
      name: /summarize class performance|regenerate/i,
    });
    await generateButton.click();
    await expect(page.getByText(/suggested next steps/i)).toBeVisible({
      timeout: 15000,
    });

    // Reloading hydrates the cached insight from the loader (no button click).
    await page.goto(assignmentUrl);
    await expect(page.getByText(/how the class did/i)).toBeVisible();
    await expect(page.getByText(/suggested next steps/i)).toBeVisible();
    await expect(
      page.getByTestId('class-insight-panel-subtitle')
    ).toContainText(/regenerate in \d+ (hours|minutes)/i);
  });
});
