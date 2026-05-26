import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setAssignmentsForOrganization } from '../db-helpers';

test.describe.serial('LEQ timed mode on student document page', () => {
  test('student opens a timed LEQ assignment and sees the countdown timer', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await setAssignmentsForOrganization({
        prisma,
        organizationId: e2eContext.organizationId,
        enabled: true,
      });

      const assignment = await prisma.assignment.create({
        data: {
          classId: e2eContext.classId,
          assignmentTypeId: e2eContext.leqAssignmentTypeId,
          title: 'E2E LEQ: New Deal Liberalism',
          prompt:
            'Evaluate the extent to which the period from 1945 to 1980 represents a continuation of New Deal liberalism.',
          timedDurationMinutes: 40,
        },
        select: { id: true },
      });

      try {
        await signIn(e2eContext.userEmail, 'johndoe');
        await page.goto('/app?tab=assignments');
        await expect(page.getByTestId('app._index')).toBeVisible();

        const assignmentCard = page
          .getByRole('button', { name: /E2E LEQ: New Deal Liberalism/i })
          .first();
        await expect(assignmentCard).toBeVisible({ timeout: 10000 });
        await assignmentCard.click();
        await page.waitForURL('**/app/documents/**', { timeout: 15000 });

        await helpers.waitForEditorReady();

        // Timer banner should be visible for timed LEQ
        const timerBanner = page.getByTestId('timed-session-banner');
        await expect(timerBanner).toBeVisible({ timeout: 5000 });
        await expect(timerBanner).toContainText(/\d+:\d+/);

        // Should show the assignment prompt
        await expect(page.getByText('New Deal liberalism')).toBeVisible();

        // Student should be able to type in the editor
        await helpers.typeInEditor(
          'The decades after 1945 carried forward the central bargain of the New Deal.'
        );
        await expect(helpers.getEditor()).toContainText(
          'The decades after 1945'
        );
        await helpers.waitForSaved();

        // Verify a TimedSession was created in the database
        const documentId = new URL(page.url()).pathname.split('/').pop();
        const timedSession = await prisma.timedSession.findUnique({
          where: { documentId: documentId as string },
        });
        expect(timedSession).not.toBeNull();
        expect(timedSession?.durationMinutes).toBe(40);
        expect(timedSession?.phase).toBe('writing');
      } finally {
        await prisma.assignment.delete({ where: { id: assignment.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test('untimed LEQ assignment does not show timer banner', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await setAssignmentsForOrganization({
        prisma,
        organizationId: e2eContext.organizationId,
        enabled: true,
      });

      const assignment = await prisma.assignment.create({
        data: {
          classId: e2eContext.classId,
          assignmentTypeId: e2eContext.leqAssignmentTypeId,
          title: 'E2E LEQ Untimed: Reconstruction',
          prompt:
            'Evaluate the extent to which Reconstruction marked a turning point.',
        },
        select: { id: true },
      });

      try {
        await signIn(e2eContext.userEmail, 'johndoe');
        await page.goto('/app?tab=assignments');
        await expect(page.getByTestId('app._index')).toBeVisible();

        const assignmentCard = page
          .getByRole('button', {
            name: /E2E LEQ Untimed: Reconstruction/i,
          })
          .first();
        await expect(assignmentCard).toBeVisible({ timeout: 10000 });
        await assignmentCard.click();
        await page.waitForURL('**/app/documents/**', { timeout: 15000 });

        await helpers.waitForEditorReady();

        // No timer banner for untimed assignments
        await expect(page.getByTestId('timed-session-banner')).not.toBeVisible({
          timeout: 3000,
        });
      } finally {
        await prisma.assignment.delete({ where: { id: assignment.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });
});
