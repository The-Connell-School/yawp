import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { encode } from 'turbo-stream';

const dbqEntry = {
  externalKey: 'apush-dbq-new-deal-federal-power',
  title: 'New Deal and Federal Power DBQ',
  prompt:
    'Evaluate the extent to which the New Deal changed the role of the federal government in the United States.',
  sourceCount: 2,
} as const;

async function removeAssignment(
  prisma: ReturnType<typeof createE2EPrismaClient>,
  assignmentId: string | null
) {
  if (!assignmentId) return;
  await prisma.submission.deleteMany({ where: { document: { assignmentId } } });
  await prisma.document.deleteMany({ where: { assignmentId } });
  await prisma.assignment.deleteMany({ where: { id: assignmentId } });
}

test.describe.serial('AP History DBQ/LEQ pilot', () => {
  test('teacher assigns an immutable tutor-off DBQ and student writes, reloads, times, and submits it', async ({
    page,
    e2eContext,
    signIn,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    const title = `E2E AP History DBQ ${Date.now()}`;
    const draft =
      'The New Deal expanded federal responsibility through durable national programs.';
    let assignmentId: string | null = null;
    let firstSource: {
      externalKey: string;
      title: string;
      body: string;
    } | null = null;
    const mutatedPrompt = `${dbqEntry.prompt} MUTATED LIVE LIBRARY ROW`;
    const mutatedSourceTitle = 'Mutated live library source';
    const mutatedSourceBody = 'This mutated source should not appear.';

    try {
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
      await expect(
        page.getByRole('button', { name: 'Import public-domain PDF' })
      ).toBeVisible();

      await page.getByLabel('Search APUSH prompts').fill('New Deal');
      await expect(page.getByText('1 of 2')).toBeVisible();
      await page.getByRole('button', { name: dbqEntry.title }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Selected APUSH Prompt')).toBeVisible();
      await dialog.getByText('Preview 2 sources').click();
      await expect(dialog.getByText(/First Inaugural Address/)).toBeVisible();
      await dialog.getByLabel('Title (optional)').fill(title);
      await dialog.getByLabel('Enable AP History tutor').click();

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
          tutorEnabled: true,
          apHistorySnapshot: true,
        },
      });
      expect(assignment).not.toBeNull();
      assignmentId = assignment!.id;
      expect(assignment?.prompt).toBe(dbqEntry.prompt);
      expect(assignment?.tutorEnabled).toBe(false);
      expect(assignment?.apHistorySnapshot).toMatchObject({
        schemaVersion: 2,
        origin: 'library',
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
      await prisma.apHistoryPromptLibraryEntry.update({
        where: { externalKey: dbqEntry.externalKey },
        data: { prompt: mutatedPrompt },
      });
      if (firstSource) {
        await prisma.apHistoryPromptLibrarySource.update({
          where: { externalKey: firstSource.externalKey },
          data: { title: mutatedSourceTitle, body: mutatedSourceBody },
        });
      }

      await page.context().clearCookies();
      await signIn(e2eContext.userEmail, 'johndoe');
      await page.goto('/app?tab=assignments');
      await page.getByRole('button', { name: new RegExp(title) }).click();
      await page.waitForURL('**/app/documents/**', { timeout: 15_000 });
      await helpers.waitForEditorReady();

      const documentId = new URL(page.url()).pathname.split('/').at(-1)!;
      await expect(page.getByTestId('ap-history-tutor-disabled')).toBeVisible();
      await expect(
        page.getByText(dbqEntry.prompt, { exact: true })
      ).toBeVisible();
      await expect(page.getByText(mutatedPrompt, { exact: true })).toHaveCount(
        0
      );
      await expect(
        page.getByText(mutatedSourceTitle, { exact: true })
      ).toHaveCount(0);
      const desktopResourceRail = page.getByRole('complementary', {
        name: 'AP History assignment resources',
      });
      await expect(
        desktopResourceRail.getByText('Document 1', { exact: true }).first()
      ).toBeVisible();
      await expect(
        desktopResourceRail.getByText(/First Inaugural Address/).first()
      ).toBeVisible();

      await page.getByTestId('ap-history-start-timer').click();
      await expect(page.getByTestId('ap-history-timer')).toContainText(
        'remaining'
      );
      const timerBeforeReload = await prisma.document.findUnique({
        where: { id: documentId },
        select: { apHistoryTimerStartedAt: true },
      });
      expect(timerBeforeReload?.apHistoryTimerStartedAt).not.toBeNull();

      await helpers.typeInEditor(draft);
      await helpers.waitForSaved();
      await page.reload();
      await helpers.waitForEditorReady();
      await expect(helpers.getEditor()).toContainText(draft);
      await expect(page.getByTestId('ap-history-timer')).toContainText(
        'remaining'
      );
      const timerAfterReload = await prisma.document.findUnique({
        where: { id: documentId },
        select: { apHistoryTimerStartedAt: true },
      });
      expect(timerAfterReload?.apHistoryTimerStartedAt?.toISOString()).toBe(
        timerBeforeReload?.apHistoryTimerStartedAt?.toISOString()
      );
      expect(
        await prisma.document.count({
          where: { assignmentId, membershipId: e2eContext.membershipId },
        })
      ).toBe(1);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await page.getByRole('tab', { name: 'Sources' }).click();
      await expect(
        page.getByRole('region', { name: 'Source documents' })
      ).toBeVisible();
      await page.getByRole('tab', { name: 'Write' }).click();
      await helpers.waitForEditorReady();
      await expect(helpers.getEditor()).toContainText(draft);
      await expect(page.getByRole('tab', { name: 'Tutor' })).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth
        )
      ).toBe(true);

      await page.getByTestId('document-submit-button').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByTestId('document-finalize-submit').click();
      await expect
        .poll(
          () =>
            prisma.submission.count({
              where: { documentId },
            }),
          { timeout: 15_000 }
        )
        .toBe(1);
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
      await removeAssignment(prisma, assignmentId);
      await prisma.$disconnect();
    }
  });

  test('teacher reviews a network-intercepted PDF extraction before creating a public-domain snapshot', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const title = `E2E Imported APUSH DBQ ${Date.now()}`;
    let assignmentId: string | null = null;
    let extractionRequests = 0;

    await page.route('**/api/ap-history/extract-document*', async (route) => {
      extractionRequests += 1;
      const body = await new Response(
        encode({
          data: {
            success: true,
            importDigest: 'c'.repeat(64),
            title,
            essayType: 'dbq',
            prompt:
              'Evaluate the extent to which the New Deal expanded federal power.',
            periodNumber: 7,
            reasoningSkill: 'causation',
            sources: [
              {
                position: 1,
                title: 'Document 1',
                attribution:
                  'Franklin D. Roosevelt, First Inaugural Address, 1933',
                body: 'This Nation asks for action, and action now.',
                isVisual: false,
              },
            ],
          },
        })
      ).text();
      await route.fulfill({
        status: 200,
        contentType: 'text/x-script',
        headers: { 'X-Remix-Response': 'yes' },
        body,
      });
    });

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/assignment-types/${e2eContext.apHistoryAssignmentTypeId}`
      );
      await page
        .getByRole('button', { name: 'Import public-domain PDF' })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('PDF file').setInputFiles({
        name: 'public-domain-dbq.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 deterministic e2e fixture'),
      });
      await dialog.getByRole('button', { name: 'Extract for review' }).click();
      await expect(dialog.getByLabel('Prompt')).toHaveValue(
        /New Deal expanded/
      );
      expect(extractionRequests).toBe(1);

      await dialog.getByLabel('Assignment title').fill(title);
      await dialog
        .getByLabel('Public provenance URL')
        .fill('https://www.archives.gov/education/lessons/fdr-inaugural');
      await dialog.getByLabel(/I verified that this assignment/).click();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/assignments/create') && response.ok()
        ),
        dialog.getByRole('button', { name: 'Create APUSH assignment' }).click(),
      ]);

      const assignment = await prisma.assignment.findFirst({
        where: {
          title,
          assignmentTypeId: e2eContext.apHistoryAssignmentTypeId,
        },
        select: { id: true, apHistorySnapshot: true },
      });
      expect(assignment).not.toBeNull();
      assignmentId = assignment!.id;
      expect(assignment?.apHistorySnapshot).toMatchObject({
        schemaVersion: 2,
        origin: 'pdf-import',
        importDigest: 'c'.repeat(64),
        essayType: 'dbq',
        sources: [
          expect.objectContaining({
            licenseName: 'Public Domain',
            provenanceUrl:
              'https://www.archives.gov/education/lessons/fdr-inaugural',
          }),
        ],
      });
    } finally {
      await removeAssignment(prisma, assignmentId);
      await prisma.$disconnect();
    }
  });
});
