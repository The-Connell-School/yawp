import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setAssignmentsForOrganization } from '../db-helpers';

test.describe.serial('Student opens a teacher-created assignment', () => {
  test('assignment card renders on student dashboard and Start creates a document', async ({
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

      const uniquePromptMarker = `E2E assignment prompt ${Date.now()}`;
      const assignment = await prisma.assignment.create({
        data: {
          classId: e2eContext.classId,
          studentCourseId: e2eContext.studentCourseId,
          title: 'E2E Rhetorical Analysis',
          prompt: `${uniquePromptMarker}: Write a 500-word rhetorical analysis of a speech of your choosing.`,
        },
        select: { id: true },
      });

      try {
        await signIn(e2eContext.userEmail, 'johndoe');
        await page.goto('/app?tab=assignments');
        await expect(page.getByTestId('app._index')).toBeVisible();

        const assignmentCard = page
          .getByRole('button', { name: /E2E Rhetorical Analysis/i })
          .first();
        await expect(assignmentCard).toBeVisible({ timeout: 10000 });
        await expect(assignmentCard).toContainText(uniquePromptMarker);

        await assignmentCard.click();
        await page.waitForURL('**/app/documents/**', { timeout: 15000 });
        const documentId = new URL(page.url()).pathname.split('/').pop();
        expect(documentId).toBeTruthy();

        await helpers.waitForEditorReady();

        const createdDoc = await prisma.document.findUnique({
          where: { id: documentId as string },
          select: { id: true, assignmentId: true, profileId: true },
        });
        expect(createdDoc).not.toBeNull();
        expect(createdDoc?.assignmentId).toBe(assignment.id);
        expect(createdDoc?.profileId).toBe(e2eContext.profileId);

        await helpers.typeInEditor('My opening paragraph for the assignment.');
        await expect(helpers.getEditor()).toContainText(
          'My opening paragraph for the assignment.'
        );
        await helpers.waitForSaved();
      } finally {
        await prisma.assignment.delete({ where: { id: assignment.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });
});
