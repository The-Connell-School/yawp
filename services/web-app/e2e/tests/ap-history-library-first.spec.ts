import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

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
    let firstSource: {
      externalKey: string;
      title: string;
      body: string;
    } | null = null;
    const mutatedPrompt = `${dbqEntry.prompt} MUTATED LIVE LIBRARY ROW`;
    const mutatedSourceTitle = 'Mutated live library source';
    const mutatedSourceBody = 'This mutated source should not appear.';

    try {
      expect(e2eContext.apHistoryDbqEntryKey).toBe(dbqEntry.externalKey);

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app');
      await expect(
        page.getByRole('link', { name: 'AP History Essay' })
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'New AP History Essay assignment' })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/app/assignment-types/${e2eContext.apHistoryAssignmentTypeId}$`)
      );
      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=assignments`
      );
      await page.getByRole('link', { name: 'AP History Essay' }).click();
      await expect(page).toHaveURL(
        new RegExp(
          `/app/assignment-types/${e2eContext.apHistoryAssignmentTypeId}\\?classId=${e2eContext.classId}$`
        )
      );

      await expect(
        page.getByRole('heading', { name: 'AP History Essay', level: 1 })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Prompt Library' })
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

      await page
        .getByRole('button', { name: new RegExp(dbqEntry.title) })
        .click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Selected APUSH Prompt')).toBeVisible();
      await expect(dialog.getByText(dbqEntry.title)).toBeVisible();
      await expect(dialog.getByText(dbqEntry.prompt)).toBeVisible();
      await expect(
        dialog.getByText(`${dbqEntry.sourceCount} Sources`)
      ).toBeVisible();
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
          title,
          classAssignments: { some: { classId: e2eContext.classId } },
          assignmentTypeId: e2eContext.apHistoryAssignmentTypeId,
        },
        select: {
          id: true,
          prompt: true,
          apHistorySnapshot: true,
        },
      });

      expect(assignment).not.toBeNull();
      expect(assignment?.prompt).toBe(dbqEntry.prompt);
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
      await page.goto(`/app/my-classes/${e2eContext.classId}`);
      await expect(page.getByTestId('student-class-detail')).toBeVisible();

      await page.getByRole('button', { name: new RegExp(title) }).click();
      await page.waitForURL('**/app/documents/**', { timeout: 15000 });
      await helpers.waitForEditorReady();

      await expect(page.getByTestId('ap-history-context-pill')).toContainText(
        'DBQ · APUSH'
      );
      await expect(page.getByTestId('assignment-prompt-strip')).toContainText(
        dbqEntry.prompt
      );
      await expect(
        page.getByText(dbqEntry.prompt, { exact: true })
      ).toHaveCount(1);
      await expect(
        page.getByRole('heading', { name: firstSource!.title })
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
        page.getByText(`${dbqEntry.sourceCount} sources · click a thumbnail`, {
          exact: true,
        })
      ).toBeVisible();
      await expect(page.getByTestId('ap-history-timing-pill')).toContainText(
        'Untimed'
      );
      await expect(
        page.getByRole('separator', { name: 'Resize tutor panel' })
      ).toBeVisible();
      await expect(
        page.getByRole('separator', { name: 'Resize document sidebar' })
      ).toBeVisible();
      await expect(
        page.getByRole('separator', { name: 'Resize sources vs editor' })
      ).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Your essay' })
      ).toHaveCount(0);
      await expect(page.getByTestId('document-editor-surface')).toBeVisible();

      const rightRail = page.getByRole('complementary', {
        name: 'Document resources',
      });
      await expect(rightRail).toBeVisible();
      await expect(rightRail).toHaveCSS(
        'background-color',
        'rgb(255, 255, 255)'
      );
      await expect(
        rightRail.getByRole('button', { name: 'Documents' })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        rightRail.getByRole('button', { name: 'Documents' })
      ).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(
        rightRail.getByRole('heading', { name: firstSource!.title })
      ).toBeVisible();
      await rightRail.getByRole('button', { name: 'Comments' }).click();
      await expect(
        rightRail.getByRole('button', { name: 'Comments' })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        rightRail.getByRole('button', { name: 'Comments' })
      ).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(rightRail.getByText('No comments yet.')).toBeVisible();
      await rightRail.getByRole('button', { name: 'Documents' }).click();
      await expect(
        rightRail.getByRole('heading', { name: firstSource!.title })
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
          title,
          assignmentTypeId: e2eContext.apHistoryAssignmentTypeId,
          classAssignments: { some: { classId: e2eContext.classId } },
        },
        select: { id: true },
      });
      const assignmentIds = createdAssignments.map(
        (assignment) => assignment.id
      );
      if (assignmentIds.length > 0) {
        await prisma.document.deleteMany({
          where: { assignmentId: { in: assignmentIds } },
        });
      }
      await prisma.assignment.deleteMany({
        where: {
          title,
          assignmentTypeId: e2eContext.apHistoryAssignmentTypeId,
          classAssignments: { some: { classId: e2eContext.classId } },
        },
      });
      await prisma.$disconnect();
    }
  });
});
