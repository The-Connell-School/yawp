import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import {
  setAssignmentsForOrganization,
  setPilotFeatureAccessTarget,
} from '../db-helpers';

const dbqEntry = {
  externalKey: 'apush-dbq-new-deal-federal-power',
  title: 'New Deal and Federal Power DBQ',
  prompt:
    'Evaluate the extent to which the New Deal changed the role of the federal government in the United States.',
  sourceCount: 2,
} as const;

test.describe.serial('AP History library-first assignment flow', () => {
  test('teacher creates a DBQ assignment from the APUSH library and student sees the snapshot', async ({
    page,
    e2eContext,
    signIn,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    const title = `E2E AP History DBQ ${Date.now()}`;
    let firstSource:
      | { externalKey: string; title: string; body: string }
      | null = null;
    const mutatedPrompt = `${dbqEntry.prompt} MUTATED LIVE LIBRARY ROW`;
    const mutatedSourceTitle = 'Mutated live library source';
    const mutatedSourceBody = 'This mutated source should not appear.';

    try {
      expect(e2eContext.apHistoryDbqEntryKey).toBe(dbqEntry.externalKey);
      await setAssignmentsForOrganization({
        prisma,
        organizationId: e2eContext.organizationId,
        enabled: true,
      });
      await setPilotFeatureAccessTarget({
        prisma,
        featureKey: 'ap_history_essay',
        targetKind: 'teacher',
        targetId: e2eContext.teacherProfileId,
        enabled: true,
        note: 'E2E AP History library-first teacher access',
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/assignment-types/${e2eContext.apHistoryAssignmentTypeId}`
      );

      await expect(
        page.getByRole('heading', { name: 'AP History Essay', level: 1 })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'APUSH Prompt Library' })
      ).toBeVisible();
      await expect(page.getByText('Upload PDF', { exact: true })).toHaveCount(
        0
      );
      await expect(
        page.locator('label').filter({ hasText: /^Prompt$/ })
      ).toHaveCount(0);
      await expect(
        page
          .locator('label')
          .filter({ hasText: /^Tutor Context \(optional\)$/ })
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'New', exact: true })
      ).toHaveCount(0);
      await expect(page.getByText('New +', { exact: true })).toHaveCount(0);

      await page.getByRole('button', { name: dbqEntry.title }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Selected APUSH Prompt')).toBeVisible();
      await expect(dialog.getByText(dbqEntry.title)).toBeVisible();
      await expect(dialog.getByText(dbqEntry.prompt)).toBeVisible();
      await expect(
        dialog.locator('label').filter({ hasText: /^Prompt$/ })
      ).toHaveCount(0);
      await expect(
        dialog
          .locator('label')
          .filter({ hasText: /^Tutor Context \(optional\)$/ })
      ).toHaveCount(0);
      await expect(dialog.getByText('Upload PDF', { exact: true })).toHaveCount(
        0
      );

      await dialog.getByLabel('Title (optional)').fill(title);
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/assignments/create') &&
            response.request().method() === 'POST' &&
            response.ok()
        ),
        dialog.getByRole('button', { name: 'Create Assignment' }).click(),
      ]);
      await expect(dialog).toHaveCount(0);

      const assignment = await prisma.assignment.findFirst({
        where: {
          classId: e2eContext.classId,
          assignmentTypeId: e2eContext.apHistoryAssignmentTypeId,
          title,
        },
        select: {
          id: true,
          prompt: true,
          tutorContext: true,
          apHistorySnapshot: true,
        },
      });

      expect(assignment).not.toBeNull();
      expect(assignment?.prompt).toBe(dbqEntry.prompt);
      expect(assignment?.tutorContext).toBeNull();
      expect(assignment?.apHistorySnapshot).toMatchObject({
        schemaVersion: 1,
        essayType: 'dbq',
        libraryEntryId: dbqEntry.externalKey,
        prompt: dbqEntry.prompt,
      });
      expect(
        (assignment?.apHistorySnapshot as { sources?: unknown[] } | null)
          ?.sources
      ).toHaveLength(dbqEntry.sourceCount);

      firstSource = await prisma.apHistoryPromptLibrarySource.findFirst({
        where: {
          promptLibraryEntry: { externalKey: dbqEntry.externalKey },
          position: 1,
        },
        select: { externalKey: true, title: true, body: true },
      });
      expect(firstSource).not.toBeNull();
      await prisma.apHistoryPromptLibraryEntry.update({
        where: { externalKey: dbqEntry.externalKey },
        data: { prompt: mutatedPrompt },
      });
      await prisma.apHistoryPromptLibrarySource.update({
        where: { externalKey: firstSource!.externalKey },
        data: { title: mutatedSourceTitle, body: mutatedSourceBody },
      });

      await page.context().clearCookies();
      await signIn(e2eContext.userEmail, 'johndoe');
      await page.goto('/app?tab=assignments');
      await expect(page.getByTestId('app._index')).toBeVisible();

      await page.getByRole('button', { name: new RegExp(title) }).click();
      await page.waitForURL('**/app/documents/**', { timeout: 15000 });
      await helpers.waitForEditorReady();

      await expect(page.getByText(/APUSH Period/)).toBeVisible();
      await expect(
        page.getByText(dbqEntry.prompt, { exact: true })
      ).toBeVisible();
      await expect(page.getByText(mutatedPrompt, { exact: true })).toHaveCount(
        0
      );
      await expect(
        page.getByText(mutatedSourceTitle, { exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByText(mutatedSourceBody, { exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByText(`${dbqEntry.sourceCount} sources`, { exact: true })
      ).toBeVisible();
    } finally {
      await prisma.apHistoryPromptLibraryEntry.updateMany({
        where: { externalKey: dbqEntry.externalKey },
        data: { prompt: dbqEntry.prompt },
      });
      if (firstSource) {
        await prisma.apHistoryPromptLibrarySource.updateMany({
          where: { externalKey: firstSource.externalKey },
          data: { title: firstSource.title, body: firstSource.body },
        });
      }
      const createdAssignments = await prisma.assignment.findMany({
        where: {
          classId: e2eContext.classId,
          assignmentTypeId: e2eContext.apHistoryAssignmentTypeId,
          title,
        },
        select: { id: true },
      });
      const assignmentIds = createdAssignments.map((assignment) => assignment.id);
      if (assignmentIds.length > 0) {
        await prisma.document.deleteMany({
          where: { assignmentId: { in: assignmentIds } },
        });
      }
      await prisma.assignment.deleteMany({
        where: {
          classId: e2eContext.classId,
          assignmentTypeId: e2eContext.apHistoryAssignmentTypeId,
          title,
        },
      });
      await prisma.$disconnect();
    }
  });
});
