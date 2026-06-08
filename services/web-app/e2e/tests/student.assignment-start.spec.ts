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
    await page.setViewportSize({ width: 1280, height: 900 });
    const prisma = createE2EPrismaClient();
    try {
      await setAssignmentsForOrganization({
        prisma,
        organizationId: e2eContext.organizationId,
        enabled: true,
      });

      const uniquePromptMarker = `E2E assignment prompt ${Date.now()}`;
      const longPrompt = [
        `${uniquePromptMarker}: Write a 500-word rhetorical analysis of a speech of your choosing.`,
        ...Array.from(
          { length: 80 },
          (_, index) =>
            `Requirement ${index + 1}: Anchor the analysis in specific evidence from the speech.`
        ),
      ].join('\n');
      const assignment = await prisma.assignment.create({
        data: {
          classId: e2eContext.classId,
          assignmentTypeId: e2eContext.assignmentTypeId,
          title: 'E2E Rhetorical Analysis',
          prompt: longPrompt,
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

        const promptPanel = page.getByTestId('assignment-prompt-panel');
        await expect(promptPanel).toBeVisible();
        await expect(promptPanel).toContainText(uniquePromptMarker);
        await expect(promptPanel).toContainText('E2E Rhetorical Analysis');
        const promptHeaderBox = await page
          .getByTestId('assignment-prompt-header')
          .boundingBox();
        expect(promptHeaderBox).not.toBeNull();
        if (!promptHeaderBox)
          throw new Error('Missing assignment prompt header');
        expect(promptHeaderBox.height).toBeLessThanOrEqual(40);
        const promptBody = promptPanel
          .locator('div')
          .filter({ hasText: uniquePromptMarker })
          .last();
        const promptBodyBox = await promptBody.boundingBox();
        expect(promptBodyBox).not.toBeNull();
        if (!promptBodyBox) throw new Error('Missing assignment prompt body');
        const expandedPromptMaxHeight = (900 - 56) / 2;
        expect(promptBodyBox.height).toBeGreaterThan(
          expandedPromptMaxHeight - 24
        );
        expect(promptBodyBox.height).toBeLessThanOrEqual(
          expandedPromptMaxHeight + 2
        );
        await expect(
          page.getByRole('button', { name: /resize assignment prompt/i })
        ).toHaveCount(0);

        const promptBox = await promptPanel.boundingBox();
        const editorBox = await page
          .getByTestId('document-editor-scroll')
          .boundingBox();
        expect(promptBox).not.toBeNull();
        expect(editorBox).not.toBeNull();
        if (!promptBox || !editorBox)
          throw new Error('Missing document column');
        expect(Math.abs(promptBox.x - editorBox.x)).toBeLessThanOrEqual(2);
        expect(Math.abs(promptBox.width - editorBox.width)).toBeLessThanOrEqual(
          2
        );
        await expect(page.getByText('No comments yet.')).toBeVisible();

        await page
          .getByRole('button', { name: /collapse assignment prompt/i })
          .click();
        await expect(promptPanel).not.toContainText(uniquePromptMarker);
        const collapsedPromptBox = await promptPanel.boundingBox();
        const tutorHeaderBox = await page
          .getByTestId('tutor-module-header')
          .boundingBox();
        expect(collapsedPromptBox).not.toBeNull();
        expect(tutorHeaderBox).not.toBeNull();
        if (!collapsedPromptBox)
          throw new Error('Missing collapsed prompt panel');
        if (!tutorHeaderBox) throw new Error('Missing tutor module header');
        expect(
          Math.abs(collapsedPromptBox.y - tutorHeaderBox.y)
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(collapsedPromptBox.height - tutorHeaderBox.height)
        ).toBeLessThanOrEqual(1);
        expect(collapsedPromptBox.height).toBeLessThanOrEqual(42);
        await expect(
          page.getByRole('button', { name: /expand assignment prompt/i })
        ).toBeVisible();

        await page.reload();
        await helpers.waitForEditorReady();
        await expect(page.getByTestId('assignment-prompt-panel')).toBeVisible();
        await expect(
          page.getByTestId('assignment-prompt-panel')
        ).not.toContainText(uniquePromptMarker);
        await expect(
          page.getByRole('button', { name: /expand assignment prompt/i })
        ).toBeVisible();

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

        await helpers.openDocument(documentId as string);
        await expect(page).not.toHaveURL(/cmsIdx=1/);
        await expect(page.getByText('E2E Module 2')).toBeVisible();

        const afterNextSessions = await prisma.assignmentModuleSession.count({
          where: { documentId: documentId as string },
        });
        expect(afterNextSessions).toBe(assignmentModules.length);

        await page.getByTestId('tutor-previous-module').click();
        await expect(page).toHaveURL(/cmsIdx=0/);
        await expect(page.getByText('E2E Module 1')).toBeVisible();

        await helpers.openDocument(documentId as string);
        await expect(page).not.toHaveURL(/cmsIdx=0/);
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
