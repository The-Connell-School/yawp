import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';

/**
 * Class Starter on three bands, from start to finish:
 *
 * 1. An admin selects "Class Starter (Excellent / Partial Credit / No Credit)"
 *    for the Class Starter assignment type in Admin → Assignment Types.
 * 2. A new Class Starter assignment pins to that rubric.
 * 3. The Grading Assistant grades on the three words.
 * 4. The teacher's score field accepts any whole number, and what the teacher
 *    saves is what the gradebook shows.
 */

const ADMIN_EMAIL = 'admin.e2e@yawp.test';
const ADMIN_PASSWORD = 'admin-e2e-password';
const TEACHER_PASSWORD = 'teacher-e2e-password';
const THREE_BAND_TITLE =
  'Class Starter (Excellent / Partial Credit / No Credit)';

test.describe.serial('Class Starter on three bands', () => {
  test('an admin selects it and a Class Starter grades and records on it end to end', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    test.setTimeout(240_000);
    const prisma = createE2EPrismaClient();
    const classStarterTypeId = e2eContext.classStarterAssignmentTypeId;
    const before = await prisma.assignmentType.findUniqueOrThrow({
      where: { id: classStarterTypeId },
      select: { rubricId: true, gradingPromptConfigJson: true },
    });
    const threeBand = await prisma.rubric.findUniqueOrThrow({
      where: { name: 'class-starter-three-band' },
      select: { id: true, currentRevisionId: true },
    });
    let documentId: string | null = null;

    try {
      // 1. Admin → Assignment Types → Class Starter → select the rubric.
      await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto(`/app/admin/assignment-types/${classStarterTypeId}`);
      await page.getByTestId('rubric-library-select').click();
      await page
        .getByRole('option', { name: THREE_BAND_TITLE, exact: true })
        .click();
      const saved = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response
            .url()
            .includes(`/app/admin/assignment-types/${classStarterTypeId}.data`)
      );
      await page.getByRole('button', { name: 'Update', exact: true }).click();
      expect((await saved).ok()).toBe(true);
      await expect
        .poll(async () =>
          (
            await prisma.assignmentType.findUniqueOrThrow({
              where: { id: classStarterTypeId },
              select: { rubricId: true },
            })
          ).rubricId
        )
        .toBe(threeBand.id);

      await page.reload();
      await expect(page.getByTestId('grading-rubric-source')).toHaveText(
        `Library rubric: ${THREE_BAND_TITLE}`
      );
      await expect(page.getByTestId('grading-rubric-scale')).toHaveText(
        'Points, 0–2'
      );
      await expect(
        page
          .getByTestId('grading-rubric-summary')
          .getByTestId('grading-rubric-level')
      ).toHaveText(['0 · No Credit', '1 · Partial Credit', '2 · Excellent']);

      // 2. A new 10-point Class Starter pins to the three-band rubric.
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { assignment, classAssignment } = await createDeployedAssignment({
        prisma,
        classId: e2eContext.classId,
        assignmentTypeId: classStarterTypeId,
        title: `Three-band Class Starter ${suffix}`,
        prompt: 'Write about something you noticed on the way to school.',
        pointValue: 10,
        submitForGrade: true,
      });
      const pinned = await prisma.assignment.findUniqueOrThrow({
        where: { id: assignment.id },
        select: { rubricRevisionId: true },
      });
      expect(pinned.rubricRevisionId).toBe(threeBand.currentRevisionId);

      const text = `Class Starter entry ${suffix}. On the way to school I noticed the crossing guard knows every kid's name, and I wondered how long that took.`;
      const document = await prisma.document.create({
        data: {
          title: `Three-band document ${suffix}`,
          text,
          html: `<p>${text}</p>`,
          membershipId: e2eContext.membershipId,
          assignmentTypeId: classStarterTypeId,
          assignmentId: assignment.id,
          classAssignmentId: classAssignment.id,
        },
        select: { id: true },
      });
      documentId = document.id;
      const submission = await prisma.submission.create({
        data: {
          documentId: document.id,
          html: `<p>${text}</p>`,
          text,
          title: `Three-band submission ${suffix}`,
          submittedAt: new Date(),
        },
        select: { id: true },
      });

      // 3. The teacher sees exactly three words and the assistant grades on them.
      await page.context().clearCookies();
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/submissions/${submission.id}`);
      await page.waitForLoadState('networkidle');
      const engagementTrigger = page.getByRole('button', {
        name: /^Engagement/,
      });
      await engagementTrigger.click();
      const engagementScore = page.getByTestId(
        'grading-rubric-score-engagement'
      );
      await engagementScore.click();
      for (const label of ['No Credit', 'Partial Credit', 'Excellent']) {
        await expect(
          page.getByRole('option', { name: label, exact: true })
        ).toBeVisible();
      }
      for (const label of ['Absent', 'Hardly there', 'Showed up', 'All in']) {
        await expect(
          page.getByRole('option', { name: label, exact: true })
        ).toHaveCount(0);
      }
      await page.keyboard.press('Escape');

      const graded = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/grade-essay-ai') &&
          response.request().method() === 'POST',
        { timeout: 60_000 }
      );
      await page.getByTestId('grading-assistant-generate').click();
      expect((await graded).status()).toBe(200);
      await expect(engagementTrigger).toContainText('Excellent', {
        timeout: 30_000,
      });
      const scoreInput = page.getByTestId('grading-overall-scale-score');
      await expect(scoreInput).toHaveValue('10');

      const afterAssistant = await prisma.submission.findUniqueOrThrow({
        where: { id: submission.id },
        select: { rubricScores: true, score: true },
      });
      expect(afterAssistant.rubricScores).toMatchObject({
        engagement: { score: 2, isAi: true },
      });
      expect(afterAssistant.score).toBe('2/2');

      // Picking Partial Credit puts half the points in the score field.
      await engagementScore.click();
      await page
        .getByRole('option', { name: 'Partial Credit', exact: true })
        .click();
      await expect(engagementTrigger).toContainText('Partial Credit');
      await expect(scoreInput).toHaveValue('5');

      // 4. The score field takes a whole number no band would give.
      await scoreInput.fill('7');
      await scoreInput.blur();
      await expect(scoreInput).toHaveValue('7');
      await page.getByTestId('submission-lifecycle-save').click();
      await expect
        .poll(
          async () =>
            (
              await prisma.submission.findUniqueOrThrow({
                where: { id: submission.id },
                select: { score: true },
              })
            ).score,
          { timeout: 60_000 }
        )
        .toBe('7/10');

      // And the gradebook shows what the teacher saved.
      await page.goto(
        `/app/my-classes/${e2eContext.classId}/assignments/${assignment.id}?status=graded`
      );
      await expect(
        page.getByRole('row', { name: new RegExp(`Three-band document ${suffix}`) })
      ).toContainText(/7\s*\/\s*10/);
    } finally {
      await prisma.$executeRawUnsafe(
        `UPDATE "AssignmentType" SET "rubricId" = $2, "gradingPromptConfigJson" = $3::jsonb WHERE id = $1`,
        classStarterTypeId,
        before.rubricId,
        before.gradingPromptConfigJson === null
          ? null
          : JSON.stringify(before.gradingPromptConfigJson)
      );
      if (documentId) {
        await prisma.document
          .delete({ where: { id: documentId } })
          .catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });
});
