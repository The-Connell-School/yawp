import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const dbqEntry = {
  externalKey: 'apush-dbq-civil-war-reconstruction',
  title: 'Civil War & Reconstruction',
  prompt:
    'Evaluate the extent to which the Civil War and Reconstruction changed the social and political status of African Americans in the period from 1861 to 1877.',
  sourceCount: 7,
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

      // The rubric is one click above the library, so "complexity" is readable
      // before a prompt is chosen rather than only inside a tutor turn. It
      // starts collapsed so the library itself stays on the first screen.
      const gradingToggle = page.getByRole('button', {
        name: 'How DBQs and LEQs are graded',
      });
      await expect(gradingToggle).toBeVisible();
      await expect(gradingToggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByText('DBQ — 7 points')).toHaveCount(0);

      const toggleBox = await gradingToggle.boundingBox();
      const libraryHeadingBox = await page
        .getByRole('heading', { name: 'Prompt Library' })
        .boundingBox();
      expect(toggleBox!.y).toBeLessThan(libraryHeadingBox!.y);

      await gradingToggle.click();
      await expect(gradingToggle).toHaveAttribute('aria-expanded', 'true');
      const gradingBreakdown = page
        .locator('section')
        .filter({ hasText: 'How DBQs and LEQs are graded' })
        .first();
      await expect(gradingBreakdown).toContainText('DBQ — 7 points');
      await expect(gradingBreakdown).toContainText('LEQ — 6 points');
      await expect(gradingBreakdown).toContainText('Sourcing (HIPP)');
      await expect(gradingBreakdown).toContainText('Complexity');

      // Collapses again, leaving the library where it was.
      await gradingToggle.click();
      await expect(gradingToggle).toHaveAttribute('aria-expanded', 'false');
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
      await expect(
        dialog.getByText('Selected Prompt', { exact: true })
      ).toBeVisible();
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

      // Classes are checkboxes, not a single-select dropdown. Arriving from a
      // class page preselects that class and nothing else; with no class
      // checked the assignment cannot be created.
      await expect(dialog.getByText('Assign to')).toBeVisible();
      const createButton = dialog.getByRole('button', {
        name: 'Create Assignment',
      });
      const classCheckbox = dialog.locator(
        `#ap-library-class-${e2eContext.classId}`
      );
      await expect(classCheckbox).toBeChecked();
      await expect(
        dialog.getByRole('checkbox', { checked: true })
      ).toHaveCount(1);
      await expect(createButton).toBeEnabled();
      await classCheckbox.uncheck();
      await expect(createButton).toBeDisabled();
      await classCheckbox.check();
      await expect(createButton).toBeEnabled();

      await dialog.getByLabel('Title (optional)').fill(title);
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/assignments/create') &&
            response.request().method() === 'POST' &&
            response.ok()
        ),
        createButton.click(),
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
        rightRail.getByRole('button', { name: 'Documents', exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        rightRail.getByRole('button', { name: 'Documents', exact: true })
      ).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(
        rightRail.getByRole('heading', { name: firstSource!.title })
      ).toBeVisible();
      await rightRail.getByRole('button', { name: 'Comments', exact: true }).click();
      await expect(
        rightRail.getByRole('button', { name: 'Comments', exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        rightRail.getByRole('button', { name: 'Comments', exact: true })
      ).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(rightRail.getByText('No comments yet.')).toBeVisible();
      await rightRail.getByRole('button', { name: 'Documents', exact: true }).click();
      await expect(
        rightRail.getByRole('heading', { name: firstSource!.title })
      ).toBeVisible();

      // Full screen read mode: documents temporarily take over the screen.
      const docsFullscreenDialog = page.getByRole('dialog', {
        name: 'Documents full screen',
      });
      await expect(docsFullscreenDialog).toHaveCount(0);
      await rightRail
        .getByRole('button', { name: 'Full screen (expand documents)' })
        .click();
      await expect(docsFullscreenDialog).toBeVisible();
      await expect(
        docsFullscreenDialog.getByRole('heading', { name: firstSource!.title })
      ).toBeVisible();
      const dialogBox = await docsFullscreenDialog.boundingBox();
      const viewport = page.viewportSize();
      expect(dialogBox?.width).toBe(viewport?.width);
      expect(dialogBox?.height).toBe(viewport?.height);
      await docsFullscreenDialog
        .getByRole('button', { name: 'Exit full screen' })
        .click();
      await expect(docsFullscreenDialog).toHaveCount(0);
      await expect(page.getByTestId('document-editor-surface')).toBeVisible();

      // Escape also exits full screen.
      await rightRail
        .getByRole('button', { name: 'Full screen (expand documents)' })
        .click();
      await expect(docsFullscreenDialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(docsFullscreenDialog).toHaveCount(0);
      await expect(
        rightRail.getByRole('button', {
          name: 'Full screen (expand documents)',
        })
      ).toBeVisible();

      // Annotation tools: selecting document text highlights it and records
      // the mark in the Annotations list.
      const sourceBody = rightRail.locator('[data-source-body]').first();
      await expect(sourceBody).toBeVisible();
      const selectedQuote = await sourceBody.evaluate((root) => {
        const seg = root.querySelector('[data-seg-start]') as HTMLElement;
        const textNode = seg.firstChild as Text;
        const start = 4;
        const end = Math.min(24, textNode.textContent!.length);
        const range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return textNode.textContent!.slice(start, end);
      });

      await rightRail
        .getByRole('button', { name: 'Highlight selection' })
        .click();
      const highlighted = rightRail.locator('[data-mark-kind~="highlight"]');
      await expect(highlighted).toHaveText(selectedQuote);
      await expect(
        rightRail.getByRole('heading', { name: 'Annotations' })
      ).toBeVisible();

      // The mark can be removed again.
      await rightRail
        .getByRole('button', { name: 'Remove annotation' })
        .click();
      await expect(
        rightRail.locator('[data-mark-kind~="highlight"]')
      ).toHaveCount(0);
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
