import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import dailyPagesSchema from '../../app/domain/rubrics/library/daily-pages-engagement.json' with { type: 'json' };
import { randomUUID } from 'node:crypto';

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

function hasDailyPagesAssignmentPointScaling(schema: unknown) {
  return Boolean(
    schema &&
      typeof schema === 'object' &&
      (schema as { outputSchema?: { assignmentPointScaling?: unknown } })
        .outputSchema?.assignmentPointScaling === 'daily_pages_engagement_v1'
  );
}

async function ensureRevisedDailyPagesRubric(prisma: ReturnType<typeof createE2EPrismaClient>, assignmentTypeId: string, createdBy: string) {
  const schema = dailyPagesSchema;
  const name = String(schema.name);
  let rubric = await prisma.rubric.findUnique({ where: { name }, include: { currentRevision: true } });
  if (!rubric) {
    rubric = await prisma.rubric.create({
      data: { name, title: String(schema.title), schemaJson: schema },
      include: { currentRevision: true },
    });
  }

  let revision = rubric.currentRevision;
  if (!revision || !hasDailyPagesAssignmentPointScaling(revision.schemaJson)) {
    const latest = await prisma.rubricRevision.findFirst({
      where: { rubricName: name },
      orderBy: { version: 'desc' },
    });
    revision = await prisma.rubricRevision.create({
      data: {
        id: randomUUID(),
        rubricName: name,
        version: (latest?.version ?? 0) + 1,
        schemaJson: schema,
        fingerprint: `e2e-${name}`,
        requestId: randomUUID(),
        requestHash: `e2e-${name}-${Date.now()}`,
        createdBy,
        reason: 'E2E fresh Daily Pages point-scale coverage',
      },
    });
    await prisma.rubric.update({
      where: { id: rubric.id },
      data: { currentRevisionId: revision.id, schemaJson: schema },
      include: { currentRevision: true },
    });
  }

  await prisma.assignmentType.update({
    where: { id: assignmentTypeId },
    data: { rubricId: rubric.id },
  });

  return revision;
}

async function createFreshPinnedDailyPagesSubmission({
  prisma,
  e2eContext,
  pointValue,
}: {
  prisma: ReturnType<typeof createE2EPrismaClient>;
  e2eContext: {
    classId: string;
    dailyPagesAssignmentTypeId: string;
    membershipId: string;
    teacherUserId: string;
  };
  pointValue: number;
}) {
  const revision = await ensureRevisedDailyPagesRubric(
    prisma,
    e2eContext.dailyPagesAssignmentTypeId,
    e2eContext.teacherUserId
  );
  const title = `Fresh Daily Pages ${pointValue} ${Date.now()}`;
  const { assignment, classAssignment } = await createDeployedAssignment({
    prisma,
    classId: e2eContext.classId,
    assignmentTypeId: e2eContext.dailyPagesAssignmentTypeId,
    title,
    prompt: 'Write freely for ten minutes about something you noticed today.',
    pointValue,
  });
  expect(assignment.rubricRevisionId).toBe(revision.id);

  const text = `${title}. I noticed how the afternoon changed when the room got quiet.`;
  const document = await prisma.document.create({
    data: {
      title,
      text,
      html: `<p>${text}</p>`,
      membershipId: e2eContext.membershipId,
      assignmentTypeId: e2eContext.dailyPagesAssignmentTypeId,
      assignmentId: assignment.id,
      classAssignmentId: classAssignment.id,
    },
  });
  const submission = await prisma.submission.create({
    data: {
      documentId: document.id,
      title,
      text,
      html: `<p>${text}</p>`,
      submittedAt: new Date(),
    },
  });

  return { title, submissionId: submission.id };
}

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

for (const scenario of [
  {
    pointValue: 10,
    selectedScore: 6,
    labelledOptions: ['0 - NOT HANDED IN', '7 - SHOWED UP', '10 - ALL IN'],
    absentOptions: ['20 - SHOWED UP', '30 - ALL IN'],
  },
  {
    pointValue: 90,
    selectedScore: 55,
    labelledOptions: ['0 - NOT HANDED IN', '60 - SHOWED UP', '90 - ALL IN'],
    absentOptions: ['20 - SHOWED UP', '30 - ALL IN'],
  },
] as const) {
  test(`fresh pinned Daily Pages uses ${scenario.pointValue}-point bands before any GA snapshot`, async ({ page, e2eContext, signIn }) => {
    const prisma = createE2EPrismaClient();
    try {
      const { title, submissionId } = await createFreshPinnedDailyPagesSubmission({
        prisma,
        e2eContext,
        pointValue: scenario.pointValue,
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/submissions/${submissionId}`);
      const panel = page.getByTestId('submission-lifecycle-panel');
      await expect(page.getByLabel(`Total points (out of ${scenario.pointValue})`, { exact: true })).toHaveValue('');
      await expect(panel.getByTestId('submission-lifecycle-save')).toBeDisabled();

      const category = page.getByRole('button', { name: /^Engagement with Prompt/ });
      await expect(category).toContainText('Not scored');
      await category.click();

      const scoreSelect = page.getByTestId('grading-rubric-score-engagement_with_prompt');
      await scoreSelect.click();
      for (const option of scenario.labelledOptions) {
        await expect(page.getByRole('option', { name: option, exact: true })).toBeVisible();
      }
      for (const option of scenario.absentOptions) {
        await expect(page.getByRole('option', { name: option, exact: true })).toHaveCount(0);
      }
      await page.getByRole('option', { name: String(scenario.selectedScore), exact: true }).click();

      await expect(
        page.getByText(`${scenario.selectedScore}/${scenario.pointValue}`, { exact: true })
      ).toBeVisible();
      await expect(page.getByLabel(`Total points (out of ${scenario.pointValue})`, { exact: true }))
        .toHaveValue(String(scenario.selectedScore));
      await page.getByTestId('grading-overall-comment').fill('Manual Daily Pages feedback.');
      await panel.getByTestId('submission-lifecycle-save').click();
      await expect(panel.getByText(`${scenario.selectedScore} / ${scenario.pointValue}`, { exact: true })).toBeVisible();

      await page.reload();
      await expect(panel.getByText(`${scenario.selectedScore} / ${scenario.pointValue}`, { exact: true })).toBeVisible();
      await panel.getByTestId('submission-lifecycle-release').click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Release', exact: true }).click();
      await expect(panel.getByTestId('grade-summary-released-label')).toBeVisible();
      await page.goto('/app/documents?status=released');
      await expect(page.getByRole('row', { name: new RegExp(title) }).getByTestId('document-status-cell'))
        .toHaveText(`Released · ${scenario.selectedScore} / ${scenario.pointValue}`);

      const saved = await prisma.submission.findUniqueOrThrow({
        where: { id: submissionId },
        include: { gradingAssistantRuns: true },
      });
      expect(saved.score).toBe(`${scenario.selectedScore}/${scenario.pointValue}`);
      expect(saved.overallScore).toBe(scenario.selectedScore);
      expect(saved.numericPercentage).toBeNull();
      expect(saved.rubricScores).toEqual({
        engagement_with_prompt: { score: scenario.selectedScore, comment: '', isAi: false },
      });
      expect(saved.gradingAssistantRuns).toHaveLength(0);
    } finally {
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
