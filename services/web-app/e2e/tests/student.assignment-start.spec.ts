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
          assignmentTypeId: e2eContext.assignmentTypeId,
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

        const sidePanel = page.getByTestId('document-side-panel');
        await expect(sidePanel).toBeVisible();

        const promptTab = sidePanel.getByRole('tab', { name: /prompt/i });
        const commentsTab = sidePanel.getByRole('tab', { name: /comments/i });
        await expect(promptTab).toHaveAttribute('aria-selected', 'true');

        const promptPanel = page.getByTestId('assignment-prompt-panel');
        await expect(promptPanel).toBeVisible();
        await expect(promptPanel).toContainText(uniquePromptMarker);
        await expect(promptPanel).toContainText('E2E Rhetorical Analysis');
        const promptPanelClass = await promptPanel.getAttribute('class');
        expect(promptPanelClass ?? '').not.toMatch(/bg-(amber|yellow)-/);

        await commentsTab.click();
        await expect(commentsTab).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByText('No comments yet.')).toBeVisible();
        await expect(promptPanel).toBeHidden();

        const createdDoc = await prisma.document.findUnique({
          where: { id: documentId as string },
          select: { id: true, assignmentId: true, profileId: true },
        });
        expect(createdDoc).not.toBeNull();
        expect(createdDoc?.assignmentId).toBe(assignment.id);
        expect(createdDoc?.profileId).toBe(e2eContext.profileId);

        const assignmentModules = await prisma.assignmentModule.findMany({
          where: { assignmentTypeId: e2eContext.assignmentTypeId },
          select: { id: true, position: true },
          orderBy: { position: 'asc' },
        });
        const initialSessions = await prisma.assignmentModuleSession.findMany({
          where: { documentId: documentId as string },
          select: {
            assignmentModuleId: true,
            assignmentModule: { select: { position: true } },
          },
          orderBy: { assignmentModule: { position: 'asc' } },
        });
        expect(initialSessions).toHaveLength(assignmentModules.length);
        expect(initialSessions.map((s) => s.assignmentModule.position)).toEqual(
          assignmentModules.map((m) => m.position)
        );

        await expect(page.getByText('E2E Module 1')).toBeVisible();
        await page.getByTestId('tutor-next-module').click();
        await expect(page).toHaveURL(/cmsIdx=1/);
        await expect(page.getByText('E2E Module 2')).toBeVisible();

        const afterNextSessions = await prisma.assignmentModuleSession.count({
          where: { documentId: documentId as string },
        });
        expect(afterNextSessions).toBe(assignmentModules.length);

        await page.getByTestId('tutor-previous-module').click();
        await expect(page).not.toHaveURL(/cmsIdx=1/);
        await expect(page.getByText('E2E Module 1')).toBeVisible();

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
