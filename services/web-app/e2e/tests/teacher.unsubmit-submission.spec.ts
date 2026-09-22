import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Teacher unsubmit submission', () => {
  test('teacher can unsubmit a submitted submission', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      // Sign in as seeded teacher
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

      // The grading page no longer exposes Unsubmit directly.
      await page.goto(`/app/submissions/${e2eContext.submittedSubmissionId}`);
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByTestId('submission-lifecycle-unsubmit')
      ).toHaveCount(0);

      // Select the submitted document from the worklist and unsubmit via Actions.
      await page.goto(
        '/app/documents?status=needs-grading&q=E2E+Essay+submission+title'
      );
      await page.waitForLoadState('networkidle');
      await page
        .getByRole('checkbox', { name: 'Select E2E Essay submission title' })
        .check();
      await page.getByTestId('teacher-document-work-actions').click();
      await page.getByRole('menuitem', { name: /Unsubmit\s+1/i }).click();
      await expect(
        page.getByRole('dialog', { name: /unsubmit documents/i })
      ).toBeVisible();
      await page.getByTestId('unsubmit-submissions-confirm').click();
      await page.waitForLoadState('networkidle');

      // Verify DB flags updated
      await expect
        .poll(async () => {
          const sub = await prisma.submission.findUnique({
            where: { id: e2eContext.submittedSubmissionId },
            select: { unsubmittedAt: true, unsubmittedByMembershipId: true },
          });
          return sub;
        })
        .toEqual({
          unsubmittedAt: expect.any(Date),
          unsubmittedByMembershipId: e2eContext.teacherMembershipId,
        });

      // Activity recorded
      const activity = await prisma.submissionActivity.findFirst({
        where: {
          submissionId: e2eContext.submittedSubmissionId,
          eventType: 'submission.unsubmitted',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          eventType: true,
          actorMembershipId: true,
          occurredAfterRelease: true,
          changes: true,
          metadata: true,
        },
      });
      expect(activity?.eventType).toBe('submission.unsubmitted');
      expect(activity?.actorMembershipId).toBe(e2eContext.teacherMembershipId);
      expect(activity?.occurredAfterRelease).toBe(false);
      // Prior status should be "submitted" and score metadata absent
      expect(activity?.metadata && (activity.metadata as any).priorStatus).toBe(
        'submitted'
      );
      expect(
        activity?.metadata && (activity.metadata as any).priorNumericPercentage
      ).toBeUndefined();
    } finally {
      await prisma.$disconnect();
    }
  });

  test('teacher can unsubmit an already-graded (released) submission and activity records prior status/score', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

      // The grading page no longer exposes Unsubmit directly.
      await page.goto(`/app/submissions/${e2eContext.gradeId}`);
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByTestId('submission-lifecycle-unsubmit')
      ).toHaveCount(0);

      // Select the released document from the worklist and unsubmit via Actions.
      await page.goto('/app/documents?status=released&q=Graded+Document');
      await page.waitForLoadState('networkidle');
      await page
        .getByRole('checkbox', { name: 'Select Graded Document' })
        .check();
      await page.getByTestId('teacher-document-work-actions').click();
      await page.getByRole('menuitem', { name: /Unsubmit\s+1/i }).click();
      await expect(
        page.getByRole('dialog', { name: /unsubmit documents/i })
      ).toBeVisible();
      await page.getByTestId('unsubmit-submissions-confirm').click();
      await page.waitForLoadState('networkidle');

      // Verify DB flags updated
      await expect
        .poll(async () => {
          const sub = await prisma.submission.findUnique({
            where: { id: e2eContext.gradeId },
            select: {
              unsubmittedAt: true,
              unsubmittedByMembershipId: true,
              gradedAt: true,
              releasedAt: true,
              numericPercentage: true,
              overallScore: true,
            },
          });
          return sub;
        })
        .toEqual(
          expect.objectContaining({
            unsubmittedAt: expect.any(Date),
            unsubmittedByMembershipId: e2eContext.teacherMembershipId,
          })
        );

      // Activity recorded with prior status/score metadata and after-release flag
      const activity = await prisma.submissionActivity.findFirst({
        where: {
          submissionId: e2eContext.gradeId,
          eventType: 'submission.unsubmitted',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          occurredAfterRelease: true,
          metadata: true,
        },
      });
      expect(activity?.occurredAfterRelease).toBe(true);
      const md = (activity?.metadata ?? {}) as any;
      expect(md.priorStatus === 'graded' || md.priorStatus === 'released').toBe(
        true
      );
      // Seeded graded submission has numericPercentage 77 and overallScore 4
      expect(typeof md.priorNumericPercentage === 'number').toBe(true);
      expect(typeof md.priorOverallScore === 'number').toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });
});
