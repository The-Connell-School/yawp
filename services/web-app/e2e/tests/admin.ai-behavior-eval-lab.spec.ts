import path from 'node:path';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test('admin can open the gated AI behavior lab and create a prompt draft', async ({
  page,
  signIn,
  e2eContext,
}, testInfo) => {
  if (process.env.AI_EVAL_QA_CAPTURE === 'true') test.slow();
  const prisma = createE2EPrismaClient();
  const captureMode = process.env.AI_EVAL_QA_CAPTURE === 'true';
  const captureDirectory = process.env.AI_EVAL_QA_ARTIFACT_DIR;
  try {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    await page.goto(
      `/app/admin/assignment-types/${e2eContext.assignmentTypeId}`
    );
    await expect(
      page.getByRole('link', { name: 'AI behavior evaluation lab' })
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'AI behavior evaluation lab' })
      .click();

    await expect(
      page.getByRole('heading', { name: 'AI behavior evaluation lab' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Human review required' })
    ).toBeVisible();
    await expect(
      page.getByText('production rollout remains a separate operator decision')
    ).toBeVisible();

    const tutorCard = page.getByTestId('tutor-prompt-card');
    const gradingCard = page.getByTestId('grading-prompt-card');
    await expect(tutorCard).toBeVisible();
    await expect(gradingCard).toBeVisible();
    if (captureMode) {
      if (captureDirectory) {
        await page.screenshot({
          path: path.join(captureDirectory, 'ai-eval-lab-desktop.png'),
          fullPage: true,
        });
      }
      await page.waitForTimeout(5_000);
    }
    await tutorCard.getByRole('button', { name: 'Create draft' }).click();
    await expect(tutorCard.getByLabel('System template')).toBeVisible();
    await expect(tutorCard.getByLabel('User template')).toBeVisible();
    await expect(
      tutorCard.getByText(/Required variables:.*base_system/)
    ).toBeVisible();
    if (captureMode) await page.waitForTimeout(5_000);

    await page.setViewportSize({ width: 375, height: 812 });
    const closeNavigation = page.getByRole('button', {
      name: 'Close app navigation',
    });
    await expect(closeNavigation).toBeVisible();
    await closeNavigation.click({ force: true, timeout: 5_000 });
    await page.waitForTimeout(500);
    await expect(
      page.getByRole('heading', { name: 'AI behavior evaluation lab' })
    ).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasHorizontalOverflow).toBe(false);
    if (captureMode) {
      if (captureDirectory) {
        await page.screenshot({
          path: path.join(captureDirectory, 'ai-eval-lab-mobile.png'),
          fullPage: true,
        });
      }
      await page.waitForTimeout(5_000);
      testInfo.annotations.push({
        type: 'qa-capture',
        description: 'Desktop, draft-created, and mobile checkpoints recorded.',
      });
    }
  } finally {
    await prisma.assignmentTypeEvaluationRun.deleteMany({
      where: { assignmentTypeId: e2eContext.assignmentTypeId },
    });
    await prisma.assignmentTypePromptVersion.deleteMany({
      where: { assignmentTypeId: e2eContext.assignmentTypeId },
    });
    await prisma.$disconnect();
  }
});
