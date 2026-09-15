import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';

const pointsRubric = {
  minScore: 0, maxScore: 30, step: 1, scoringType: 'points_scale',
  categories: [{ key: 'engagement', label: 'Engagement', description: 'Engagement only.', weight: 1,
    bands: [{ label: 'SHOWED UP', min: 17, max: 23, description: 'Meaningful engagement.' }] }],
};

for (const pointValue of [10, 30, 90, 100]) {
  test(`released points and teacher edit/save/reload agree out of ${pointValue}`, async ({ page, e2eContext, signIn }) => {
    const prisma = createE2EPrismaClient();
    const title = `Points ${pointValue} ${Date.now()}`;
    const { assignment, classAssignment } = await createDeployedAssignment({ prisma, classId: e2eContext.classId,
      assignmentTypeId: e2eContext.assignmentTypeId, title, prompt: 'Write about today.', pointValue });
    const document = await prisma.document.create({ data: { title, text: title, html: `<p>${title}</p>`,
      membershipId: e2eContext.membershipId, assignmentTypeId: e2eContext.assignmentTypeId,
      assignmentId: assignment.id, classAssignmentId: classAssignment.id } });
    const submission = await prisma.submission.create({ data: { documentId: document.id, title,
      text: title, html: `<p>${title}</p>`, score: '18/30', overallScore: 18,
      rubricScores: { engagement: { score: 18, comment: '' } }, submittedAt: new Date(), gradedAt: new Date(),
      gradingAssistantRuns: { create: { source: 'assignment-type', status: 'success', assignmentTypeRubricSnapshot: pointsRubric } } } });
    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/submissions/${submission.id}`);
      const panel = page.getByTestId('submission-lifecycle-panel');
      const initial = Math.round(18 / 30 * pointValue);
      await expect(panel.getByText(`${initial} / ${pointValue}`, { exact: true })).toBeVisible();
      await expect(panel).not.toContainText('%');
      await panel.getByTestId('submission-lifecycle-edit').click();
      const total = page.getByLabel(`Total points (out of ${pointValue})`, { exact: true });
      await expect(total).toHaveValue(String(initial));
      const awarded = pointValue === 90 ? 55 : 0;
      await total.fill(String(awarded));
      await panel.getByTestId('submission-lifecycle-save').click();
      await expect(panel.getByText(`${awarded} / ${pointValue}`, { exact: true })).toBeVisible();
      await page.reload();
      await expect(panel.getByText(`${awarded} / ${pointValue}`, { exact: true })).toBeVisible();
      await panel.getByTestId('submission-lifecycle-edit').click();
      await expect(total).toHaveValue(String(awarded));
      await panel.getByTestId('submission-lifecycle-cancel').click();
      await panel.getByTestId('submission-lifecycle-release').click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Release', exact: true }).click();
      await expect(panel.getByTestId('grade-summary-released-label')).toBeVisible();
      await page.goto('/app/documents?status=released');
      await expect(page.getByRole('row', { name: new RegExp(title) }).getByTestId('document-status-cell'))
        .toHaveText(`Released · ${awarded} / ${pointValue}`);
      const saved = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
      expect(saved.score).toBe(`${awarded}/${pointValue}`);
      expect(saved.numericPercentage).toBeNull();
      expect(saved.rubricScores).toEqual({ engagement: { score: 18, comment: '' } });
    } finally {
      await prisma.submissionActivity.deleteMany({ where: { submissionId: submission.id } });
      await prisma.document.delete({ where: { id: document.id } });
      await prisma.classAssignment.delete({ where: { id: classAssignment.id } });
      await prisma.assignment.delete({ where: { id: assignment.id } });
      await prisma.$disconnect();
    }
  });
}

test('weighted grade summary has points without a residual percentage', async ({ page, e2eContext, signIn }) => {
  await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
  await page.goto(`/app/submissions/${e2eContext.submittedSubmissionId}`);
  const panel = page.getByTestId('submission-lifecycle-panel');
  await expect(panel).not.toContainText('%');
  await expect(panel).not.toContainText('Overall Percentage');
});
