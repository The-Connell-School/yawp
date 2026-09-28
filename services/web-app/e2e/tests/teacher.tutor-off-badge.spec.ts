import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';

const COLD_WRITE_TITLE = 'E2E Cold Write Diagnostic';

/**
 * A teacher who turns the tutor off for a diagnostic has to be able to find
 * that paper again later. These cover the marker that makes a cold write
 * recognizable in the surfaces a teacher actually scans.
 */
test.describe.serial('Tutor off badge', () => {
  test.setTimeout(60_000);

  test('marks the tutor-off assignment in My Assignments and on its detail page', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    let createdAssignmentId: string | null = null;

    try {
      const { assignment } = await createDeployedAssignment({
        prisma,
        classId: e2eContext.classId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        title: COLD_WRITE_TITLE,
        prompt: 'Write this one on your own.',
        tutorEnabled: false,
      });
      createdAssignmentId = assignment.id;

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/assignments');
      await page.waitForLoadState('networkidle');

      const coldRow = page
        .getByRole('row')
        .filter({ hasText: COLD_WRITE_TITLE });
      await expect(coldRow.getByTestId('tutor-off-badge')).toHaveText(
        'Tutor off'
      );

      // The tutor is on by default, so the ordinary seeded assignment carries
      // no badge — the marker means something only if it is the exception.
      const warmRow = page
        .getByRole('row')
        .filter({ hasText: 'E2E Class Assignment' });
      await expect(warmRow.getByTestId('tutor-off-badge')).toHaveCount(0);

      await page.goto(
        `/app/assignments/${createdAssignmentId}?classId=${e2eContext.classId}`
      );
      await expect(page.getByTestId('assignment-detail-page')).toBeVisible();
      await expect(page.getByTestId('tutor-off-badge')).toBeVisible();
    } finally {
      if (createdAssignmentId) {
        await prisma.classAssignment.deleteMany({
          where: { assignmentId: createdAssignmentId },
        });
        await prisma.assignment.deleteMany({
          where: { id: createdAssignmentId },
        });
      }
    }
  });

  test('marks the tutor-off assignment in the class Assignments tab', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    let createdAssignmentId: string | null = null;

    try {
      const { assignment } = await createDeployedAssignment({
        prisma,
        classId: e2eContext.classId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        title: COLD_WRITE_TITLE,
        prompt: 'Write this one on your own.',
        tutorEnabled: false,
      });
      createdAssignmentId = assignment.id;

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      // The class page opens on the Students tab and only builds the
      // assignments table once that tab is active, so the badge is not on the
      // page without this parameter.
      await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
      await page.waitForLoadState('networkidle');

      const coldRow = page
        .getByRole('row')
        .filter({ hasText: COLD_WRITE_TITLE });
      await expect(coldRow.getByTestId('tutor-off-badge')).toHaveText(
        'Tutor off'
      );
    } finally {
      if (createdAssignmentId) {
        await prisma.classAssignment.deleteMany({
          where: { assignmentId: createdAssignmentId },
        });
        await prisma.assignment.deleteMany({
          where: { id: createdAssignmentId },
        });
      }
    }
  });
});
