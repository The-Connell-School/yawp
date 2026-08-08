import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const PASTE_SHORTCUT = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';

const PASTED_PASSAGE =
  'The revolution began not with a shout but with a ledger entry that nobody read.';
const STUDENT_PASSAGE = 'I started my essay here, in my own words.';

const DOCUMENT_HTML =
  `<p>${STUDENT_PASSAGE} ` +
  `<span data-pasted-at="2026-08-01T12:00:00.000Z" data-pasted-source="external" class="pasted-source-mark">${PASTED_PASSAGE}</span>` +
  ` And then I kept going.</p>`;

/**
 * The in-document half of the paste record. The mark is in the saved HTML
 * either way; what these tests pin is who it paints for — a teacher reading
 * the work sees the passage, the student writing it does not.
 */
test.describe('Pasted-text highlight in the document', () => {
  let documentId: string | null = null;

  test.beforeEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      const created = await prisma.document.create({
        data: {
          title: 'Paste highlight fixture',
          html: DOCUMENT_HTML,
          text: `${STUDENT_PASSAGE} ${PASTED_PASSAGE} And then I kept going.`,
          membershipId: e2eContext.membershipId,
          assignmentTypeId: e2eContext.assignmentTypeId,
        },
        select: { id: true },
      });
      documentId = created.id;
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterEach(async () => {
    if (!documentId) return;
    const prisma = createE2EPrismaClient();
    try {
      await prisma.document.delete({ where: { id: documentId } }).catch(() => {});
    } finally {
      documentId = null;
      await prisma.$disconnect();
    }
  });

  test('a teacher reading the work sees the pasted passage marked, quietly', async ({
    page,
    e2eContext,
    signIn,
    helpers,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await helpers.openDocument(documentId!, { retry: true });

    const surface = page.getByTestId('document-editor-surface');
    await expect(surface).toHaveClass(/pasted-source-visible/);

    const mark = page.locator('[data-pasted-source="external"]');
    await expect(mark).toHaveText(PASTED_PASSAGE);

    // It actually paints for the teacher.
    const background = await mark.evaluate(
      (node) => getComputedStyle(node).backgroundColor
    );
    expect(background).not.toBe('rgba(0, 0, 0, 0)');
    expect(background).not.toBe('transparent');

    // Informational, not accusatory: no label, no icon, no alarm language
    // anywhere on the passage or around it.
    await expect(mark).toHaveAttribute('data-pasted-source', 'external');
    await expect(
      page.getByText(/plagiar|cheat|flagged|violation/i)
    ).toHaveCount(0);
  });

  test('the student writing the document does not see the highlight', async ({
    page,
    e2eContext,
    helpers,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(documentId!, { retry: true });

    const surface = page.getByTestId('document-editor-surface');
    await expect(surface).not.toHaveClass(/pasted-source-visible/);

    // The mark is still in their document — it just paints nothing.
    const mark = page.locator('[data-pasted-source="external"]');
    await expect(mark).toHaveText(PASTED_PASSAGE);

    const background = await mark.evaluate(
      (node) => getComputedStyle(node).backgroundColor
    );
    expect(background).toBe('rgba(0, 0, 0, 0)');
  });

  test('a real outside paste ends up highlighted for the teacher who opens the work next', async ({
    page,
    e2eContext,
    helpers,
    signIn,
  }) => {
    test.setTimeout(90_000);

    const outsideText = 'Pasted in from somewhere else. '.repeat(10);
    const prisma = createE2EPrismaClient();

    try {
      await signIn(e2eContext.userEmail, 'johndoe');
      await page
        .context()
        .grantPermissions(['clipboard-read', 'clipboard-write']);
      await helpers.openDocument(documentId!, { retry: true });

      await page.evaluate(
        (text) => navigator.clipboard.writeText(text),
        outsideText
      );
      await helpers.getEditor().click();
      await page.keyboard.press('End');

      const pasteAlertPosted = page.waitForResponse(
        (res) =>
          res.url().includes('/api/paste-alert') &&
          res.request().method() === 'POST',
        { timeout: 15000 }
      );
      await page.keyboard.press(PASTE_SHORTCUT);
      await pasteAlertPosted;

      // The mark lands on the pasted run only.
      const pastedMarks = page.locator('[data-pasted-source="external"]');
      await expect(pastedMarks.last()).toContainText(
        'Pasted in from somewhere else.'
      );

      // …and reaches the server, so the teacher opening it later sees it.
      await expect
        .poll(
          async () => {
            const doc = await prisma.document.findUnique({
              where: { id: documentId! },
              select: { html: true },
            });
            return doc?.html?.includes('data-pasted-source') ?? false;
          },
          { timeout: 20000 }
        )
        .toBe(true);

      // Hand the browser over to the teacher: signing in again while the
      // student's session is live would just bounce off /auth/login.
      await page.context().clearCookies();
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await helpers.openDocument(documentId!, { retry: true });

      await expect(page.getByTestId('document-editor-surface')).toHaveClass(
        /pasted-source-visible/
      );
      const teacherMark = page
        .locator('[data-pasted-source="external"]')
        .last();
      await expect(teacherMark).toContainText('Pasted in from somewhere else.');
      const background = await teacherMark.evaluate(
        (node) => getComputedStyle(node).backgroundColor
      );
      expect(background).not.toBe('rgba(0, 0, 0, 0)');
    } finally {
      await prisma.$disconnect();
    }
  });
});
