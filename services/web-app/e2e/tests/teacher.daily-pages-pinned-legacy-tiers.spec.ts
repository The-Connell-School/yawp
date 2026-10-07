import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import type { E2EContext } from '../seed-e2e';

async function seedPinnedLegacyDailyPagesAssignment(e2eContext: E2EContext) {
  const prisma = createE2EPrismaClient();
  try {
    const legacySchema = {
      name: 'daily-pages-engagement',
      title: 'Daily Pages engagement',
      scoringScale: {
        type: 'rubric_points',
        minScore: 0,
        maxScore: 30,
        step: 10,
        compositeMin: 0,
        compositeMax: 30,
      },
      rubric: {
        categories: [
          {
            key: 'engagement_with_prompt',
            label: 'Engagement with Prompt',
            weight: 1,
            scoreLabels: [
              { value: 0, label: 'Not Present' },
              { value: 10, label: 'Needs More' },
              { value: 20, label: 'Good' },
              { value: 30, label: 'Excellent' },
            ],
          },
        ],
      },
      outputSchema: { responseShape: 'categories_overall_comment', schemaVersion: 1 },
    };
    const revision = await prisma.rubricRevision.create({
      data: {
        id: `legacy-pin-${Date.now()}`,
        rubricName: 'daily-pages-engagement',
        version: 99_001,
        schemaJson: legacySchema,
        fingerprint: `legacy-pin-${Date.now()}`,
        requestId: `legacy-pin-${Date.now()}`,
        requestHash: `legacy-pin-${Date.now()}`,
        createdBy: 'e2e',
        reason: 'Pinned legacy Daily Pages fixture',
      },
      select: { id: true },
    });
    const { assignment } = await createDeployedAssignment({
      prisma,
      classId: e2eContext.classId,
      assignmentTypeId: e2eContext.dailyPagesAssignmentTypeId,
      title: `Pinned legacy Daily Pages ${Date.now()}`,
      prompt: 'Describe a place that matters to you.',
      pointValue: 30,
    });
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { rubricRevisionId: revision.id },
    });
    return assignment.id;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Pinned legacy Daily Pages assignment', () => {
  test('still shows 0 / 10 / 20 / 30 style tiers when editing', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const assignmentId = await seedPinnedLegacyDailyPagesAssignment(e2eContext);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/assignments/${assignmentId}`);

    await page.getByRole('button', { name: /Edit/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/Point value/i)).toHaveValue('30');
    await expect(page.getByText(/10/).first()).toBeVisible();
    await expect(page.getByText(/20/).first()).toBeVisible();
  });
});
