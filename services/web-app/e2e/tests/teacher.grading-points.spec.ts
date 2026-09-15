import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';

const pointsRubric = {
  minScore: 0, maxScore: 30, step: 1, scoringType: 'points_scale',
  categories: [{ key: 'engagement', label: 'Engagement', description: 'Engagement only.', weight: 1,
    bands: [
      { label: 'NOT HANDED IN', min: 0, max: 0, description: 'Nothing submitted.' },
      { label: 'HARDLY THERE', min: 7, max: 13, description: 'Limited engagement.' },
      { label: 'SHOWED UP', min: 17, max: 23, description: 'Meaningful engagement.' },
      { label: 'ALL IN', min: 28, max: 30, description: 'Full engagement.' },
    ] }],
};

for (const pointValue of [10, 30, 90, 100]) {
  test(`released points and teacher edit/save/reload agree out of ${pointValue}`, async ({ page, e2eContext, signIn }, testInfo) => {
    const prisma = createE2EPrismaClient();
    const title = `Points ${pointValue} ${Date.now()}`;
    const { assignment, classAssignment } = await createDeployedAssignment({ prisma, classId: e2eContext.classId,
      assignmentTypeId: e2eContext.assignmentTypeId, title, prompt: 'Write about today.', pointValue });
    const document = await prisma.document.create({ data: { title, text: title, html: `<p>${title}</p>`,
      membershipId: e2eContext.membershipId, assignmentTypeId: e2eContext.assignmentTypeId,
      assignmentId: assignment.id, classAssignmentId: classAssignment.id } });
    const submission = await prisma.submission.create({ data: { documentId: document.id, title,
      text: title, html: `<p>${title}</p>`, score: '18/30', overallScore: 18,
      rubricScores: { engagement: { score: 18, comment: '' } }, submittedAt: new Date(), gradedAt: new Date(), gradedByMembershipId: e2eContext.teacherMembershipId,
      gradingAssistantRuns: { create: { source: 'assignment-type', status: 'succeeded', assignmentTypeRubricSnapshot: pointsRubric, metadata: { output: { score: '18/30', numericPercentage: null, rubricScores: { engagement: { score: 18, comment: '' } }, overallComment: 'Engaged writing.' } } } } } });
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
      await panel.getByTestId('grading-reset-to-assistant-suggestions').click();
      await expect(total).toHaveValue(String(initial));
      await panel.getByTestId('submission-lifecycle-cancel').click();
      await expect(panel.getByText(`${awarded} / ${pointValue}`, { exact: true })).toBeVisible();
      await panel.getByTestId('submission-lifecycle-release').click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Release', exact: true }).click();
      await expect(panel.getByTestId('grade-summary-released-label')).toBeVisible();
      await page.goto('/app/documents?status=released');
      await expect(page.getByRole('row', { name: new RegExp(title) }).getByTestId('document-status-cell'))
        .toHaveText(`Released · ${awarded} / ${pointValue}`);
      await page.screenshot({ path: testInfo.outputPath('released-points.png'), fullPage: true });
      const saved = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
      expect(saved.score).toBe(`${awarded}/${pointValue}`);
      expect(saved.numericPercentage).toBeNull();
      expect(saved.rubricScores).toEqual({ engagement: { score: 18, comment: '' } });
    } finally {
      // Audit rows are immutable. The dedicated E2E database is reset by its
      // seed lifecycle, rather than deleting individual submission history.
      await prisma.$disconnect();
    }
  });
}

test('weighted grade displays and edits exact points without a residual percentage', async ({ page, e2eContext, signIn }, testInfo) => {
  const prisma = createE2EPrismaClient();
  try {
    const submission = await prisma.submission.findUniqueOrThrow({ where: { id: e2eContext.unreleasedGradedSubmissionId }, include: { document: true } });
    await prisma.assignment.update({ where: { id: submission.document.assignmentId! }, data: { pointValue: 200 } });
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/submissions/${submission.id}`);
    const panel = page.getByTestId('submission-lifecycle-panel');
    await expect(panel).not.toContainText('%');
    await expect(panel).not.toContainText('Overall Percentage');
    await panel.getByTestId('submission-lifecycle-edit').click();
    const total = page.getByLabel('Total points (out of 200)', { exact: true });
    await expect(total).toHaveValue(String(Math.round(submission.numericPercentage! * 2)));
    await total.fill('91');
    await panel.getByTestId('submission-lifecycle-save').click();
    await expect(panel.getByText('91 / 200', { exact: true })).toBeVisible();
    await page.reload();
    await expect(panel.getByText('91 / 200', { exact: true })).toBeVisible();
    await panel.getByTestId('submission-lifecycle-edit').click();
    await expect(total).toHaveValue('91');
    const saved = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(saved.score).toBe('91/200');
    expect(saved.numericPercentage).toBe(46);
    await page.screenshot({ path: testInfo.outputPath('weighted-points-edit.png'), fullPage: true });
  } finally { await prisma.$disconnect(); }
});
