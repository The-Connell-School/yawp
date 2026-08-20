import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';

test.describe('Released grade editing and submission activity', () => {
  test('records the teacher edit and never exposes activity to the student', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const document = await prisma.document.create({
      data: {
        title: `Released grade audit ${Date.now()}`,
        text: 'A dedicated released submission for audit testing.',
        html: '<p>A dedicated released submission for audit testing.</p>',
        membershipId: e2eContext.membershipId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        assignmentId: e2eContext.assignmentId,
        classAssignmentId: e2eContext.classAssignmentId,
      },
      select: { id: true, title: true, text: true, html: true },
    });
    const releasedAt = new Date('2026-08-20T12:00:00.000Z');
    const submission = await prisma.submission.create({
      data: {
        documentId: document.id,
        title: document.title,
        text: document.text ?? '',
        html: document.html ?? '',
        submittedAt: new Date('2026-08-19T12:00:00.000Z'),
        gradedAt: new Date('2026-08-20T11:00:00.000Z'),
        gradedByMembershipId: e2eContext.teacherMembershipId,
        numericPercentage: 77,
        letterGrade: 'C+',
        overallScore: 4,
        overallComment: 'Good effort with room for improvement.',
        rubricScores: {
          thesis_and_content: 5,
          organization_and_structure: 1,
          evidence_and_support: 5,
          voice_and_style: 1,
          grammar_and_mechanics: 1,
        },
        releasedAt,
      },
      select: { id: true },
    });
    const original = await prisma.submission.findUniqueOrThrow({
      where: { id: submission.id },
      select: {
        releasedAt: true,
        numericPercentage: true,
        letterGrade: true,
        overallComment: true,
        gradedAt: true,
        gradedByMembershipId: true,
      },
    });

    try {
      expect(original.releasedAt).not.toBeNull();
      await expect(
        prisma.submissionActivity.count({
          where: { submissionId: submission.id },
        })
      ).resolves.toBe(0);

      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/submissions/${submission.id}`);
      await page.waitForLoadState('networkidle');

      const panel = page.getByTestId('submission-lifecycle-panel');
      await expect(
        panel.getByTestId('grade-summary-released-label')
      ).toHaveText('Released');
      await expect(
        page.getByTestId('submission-activity-trigger')
      ).toBeVisible();

      await panel.getByTestId('submission-lifecycle-edit').click();
      await expect(
        page.getByTestId('released-grade-edit-warning')
      ).toBeVisible();
      await expect(page.getByTestId('grading-assistant-generate')).toHaveCount(
        0
      );

      const saveButton = panel.getByTestId('submission-lifecycle-save');
      await expect(saveButton).toBeDisabled();
      await page.getByTestId('grading-overall-percentage').fill('92');
      await page
        .getByTestId('grading-overall-comment')
        .fill('Excellent revision after release.');
      await expect(saveButton).toBeEnabled();
      await saveButton.click();
      await expect(page.getByTestId('released-grade-edit-warning')).toHaveCount(
        0,
        {
          timeout: 15000,
        }
      );

      const persisted = await prisma.submission.findUniqueOrThrow({
        where: { id: submission.id },
        select: {
          releasedAt: true,
          numericPercentage: true,
          overallComment: true,
        },
      });
      expect(persisted.releasedAt?.toISOString()).toBe(
        original.releasedAt?.toISOString()
      );
      expect(persisted.numericPercentage).toBe(92);
      expect(persisted.overallComment).toBe(
        'Excellent revision after release.'
      );

      const activities = await prisma.submissionActivity.findMany({
        where: { submissionId: submission.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(activities).toHaveLength(1);
      expect(activities[0]).toMatchObject({
        organizationId: e2eContext.organizationId,
        actorMembershipId: e2eContext.teacherMembershipId,
        eventType: 'submission.grade_updated',
        source: 'update-submission',
        occurredAfterRelease: true,
        changes: {
          numericPercentage: {
            before: original.numericPercentage,
            after: 92,
          },
          overallComment: {
            before: original.overallComment,
            after: 'Excellent revision after release.',
          },
        },
      });

      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(panel.getByText('92%').first()).toBeVisible();
      await expect(
        panel.getByText('Excellent revision after release.')
      ).toBeVisible();
      await page.getByTestId('submission-activity-trigger').click();
      const activityList = page.getByTestId('submission-activity-list');
      await expect(
        activityList.getByText('Grade or feedback changed')
      ).toBeVisible();
      await expect(
        activityList.getByText(e2eContext.teacherName)
      ).toBeVisible();
      await expect(
        activityList.getByText('After release', { exact: true })
      ).toBeVisible();
      await expect(activityList.getByText('77', { exact: true })).toBeVisible();
      await expect(activityList.getByText('92', { exact: true })).toBeVisible();

      await page.context().clearCookies();
      await signIn(e2eContext.userEmail, STUDENT_PASSWORD);
      await page.goto(`/app/submissions/${submission.id}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/92%/).first()).toBeVisible();
      await expect(
        page.getByText('Excellent revision after release.')
      ).toBeVisible();
      await expect(page.getByTestId('submission-activity-trigger')).toHaveCount(
        0
      );
      await expect(page.getByTestId('submission-lifecycle-edit')).toHaveCount(
        0
      );
    } finally {
      await prisma.$transaction([
        prisma.submissionActivity.deleteMany({
          where: { submissionId: submission.id },
        }),
        prisma.submission.delete({ where: { id: submission.id } }),
      ]);
      await prisma.document.delete({ where: { id: document.id } });
      await prisma.$disconnect();
    }
  });
});
