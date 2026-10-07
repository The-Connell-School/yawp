import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';

test.describe.serial('Admin teacher notes output toggle', () => {
  test.setTimeout(120_000);

  test('superadmin enables private notes; teacher sees persisted note and student does not', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now();
    const rubricName = `teacher-notes-e2e-${suffix}`;
    const note =
      'The closing paragraph shifts into formal vocabulary unlike the rest.';
    let rubricId: string | null = null;
    let assignmentTypeId: string | null = null;
    let submissionId: string | null = null;
    let assignmentId: string | null = null;

    const schema = {
      name: rubricName,
      title: `Teacher notes E2E ${suffix}`,
      scoringScale: { type: 'weighted_1_5', minScore: 1, maxScore: 5, step: 1 },
      rubric: {
        categories: [
          {
            key: 'quality',
            label: 'Quality',
            weight: 1,
            description: 'Overall writing quality.',
            feedbackEnabled: true,
          },
        ],
      },
      promptConfig: { gradingInstructions: 'Grade the sample fairly.' },
      outputSchema: { schemaVersion: 1, responseShape: 'categories_overall_comment' },
    };

    try {
      const rubric = await prisma.rubric.create({
        data: { name: rubricName, title: schema.title, schemaJson: schema },
      });
      rubricId = rubric.id;

      await signIn(e2eContext.superAdminEmail, 'admin-e2e-password');
      await page.goto('/app/admin/assignments');
      await page.getByRole('link', { name: 'Create assignment type' }).click();
      await page.getByLabel('Title').fill(`Teacher notes type ${suffix}`);
      await page.getByTestId('rubric-library-select').click();
      await page.getByRole('option', { name: schema.title, exact: true }).click();
      await Promise.all([
        page.waitForURL(/\/app\/admin\/assignment-types\/[^/]+$/),
        page.getByRole('button', { name: 'Create' }).click(),
      ]);
      assignmentTypeId = page.url().split('/').pop() ?? null;

      const toggle = page.getByTestId('rubric-teacher-notes-toggle');
      await expect(toggle).toBeVisible({ timeout: 15000 });
      await expect(toggle).toBeEnabled();
      await expect(toggle).not.toBeChecked();
      await toggle.click();
      await expect
        .poll(async () => {
          const row = await prisma.rubric.findUnique({
            where: { id: rubricId! },
            select: { schemaJson: true },
          });
          return (row?.schemaJson as { outputSchema?: { teacherNotesEnabled?: boolean } })
            ?.outputSchema?.teacherNotesEnabled;
        })
        .toBe(true);

      const { assignment, classAssignment } = await createDeployedAssignment({
        prisma,
        classId: e2eContext.classId,
        assignmentTypeId: assignmentTypeId!,
        prompt: 'Write about a place that matters to you.',
        pointValue: 20,
      });
      assignmentId = assignment.id;

      const document = await prisma.document.create({
        data: {
          title: 'Teacher notes submission',
          text: 'My kitchen smells like bread. Therefore one must conclude the ontological status of yeast is paramount.',
          html: '<p>My kitchen smells like bread. Therefore one must conclude the ontological status of yeast is paramount.</p>',
          membershipId: e2eContext.membershipId,
          assignmentTypeId: assignmentTypeId!,
          assignmentId: assignment.id,
          classAssignmentId: classAssignment.id,
        },
      });
      submissionId = document.id;
      await prisma.submission.create({
        data: {
          id: document.id,
          documentId: document.id,
          title: document.title,
          text: document.text ?? '',
          html: document.html ?? '',
          submittedAt: new Date(),
        },
      });

      await prisma.submissionGradingAssistantRun.create({
        data: {
          submissionId,
          source: 'assignment-type',
          status: 'succeeded',
          assignmentTypeRubricSnapshot: {
            categories: schema.rubric.categories,
            minScore: 1,
            maxScore: 5,
            step: 1,
            scoringType: 'weighted_1_5',
          },
          metadata: {
            teacherNote: note,
            output: {
              rubricScores: {
                quality: { score: 4, comment: 'Strong voice.', isAi: true },
              },
              overallComment: 'Jordan, your bread detail is vivid and personal.',
              score: '4/5',
            },
          },
        },
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/submissions/${submissionId}`);
      await expect(page.getByTestId('teacher-private-notes')).toContainText(note, {
        timeout: 30000,
      });

      await signIn(e2eContext.userEmail, 'johndoe');
      await page.goto(`/app/submissions/${submissionId}`);
      await expect(page.getByTestId('teacher-private-notes')).toHaveCount(0);
      expect(await page.content()).not.toContain(note);

      await signIn(e2eContext.adminEmail, 'admin-e2e-password');
      await page.goto(`/app/admin/assignment-types/${assignmentTypeId}`);
      await expect(page.getByTestId('rubric-teacher-notes-toggle')).toBeDisabled();
    } finally {
      if (submissionId) {
        await prisma.submissionGradingAssistantRun.deleteMany({
          where: { submissionId },
        });
        await prisma.submission.deleteMany({ where: { id: submissionId } });
        await prisma.document.deleteMany({ where: { id: submissionId } });
      }
      if (assignmentId) {
        await prisma.classAssignment.deleteMany({
          where: { assignmentId },
        });
        await prisma.assignment.deleteMany({ where: { id: assignmentId } });
      }
      if (assignmentTypeId) {
        await prisma.assignmentModule.deleteMany({
          where: { assignmentTypeId },
        });
        await prisma.organizationAssignmentType.deleteMany({
          where: { assignmentTypeId },
        });
        await prisma.assignmentType.deleteMany({ where: { id: assignmentTypeId } });
      }
      if (rubricId) {
        await prisma.rubricRevision.deleteMany({ where: { rubricName } });
        await prisma.rubric.deleteMany({ where: { id: rubricId } });
      }
      await prisma.$disconnect();
    }
  });
});
