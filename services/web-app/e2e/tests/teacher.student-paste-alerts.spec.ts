import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe('Teacher student paste alerts', () => {
  test('shows paste activity in the student sheet, with document id and a working link', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    let pasteAlertId: string | null = null;

    try {
      const created = await prisma.pasteAlert.create({
        data: {
          documentId: e2eContext.editedDocumentId,
          membershipId: e2eContext.membershipId,
          textLength: 312,
          content: 'e2e seeded pasted content',
        },
        select: { id: true },
      });
      pasteAlertId = created.id;

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/my-classes/${e2eContext.classId}?tab=students`);
      await page.waitForLoadState('networkidle');

      const studentRow = page
        .getByRole('row')
        .filter({ hasText: e2eContext.userEmail });
      await expect(studentRow).toBeVisible();
      await studentRow.click();

      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();

      // Quiet, informational framing — no alarm language.
      await expect(sheet.getByText(/alert|warning|flagged/i)).toHaveCount(0);

      await expect(sheet.getByText('312 chars')).toBeVisible();
      await expect(
        sheet.getByText(e2eContext.editedDocumentId)
      ).toBeVisible();

      const documentLink = sheet.locator(
        `a[href*="/app/documents/${e2eContext.editedDocumentId}"]`
      );
      await expect(documentLink).toBeVisible();

      await documentLink.click();
      await expect(page).toHaveURL(
        new RegExp(`/app/documents/${e2eContext.editedDocumentId}`)
      );
    } finally {
      if (pasteAlertId) {
        await prisma.pasteAlert
          .delete({ where: { id: pasteAlertId } })
          .catch(() => {});
      }
      await prisma.$disconnect();
    }
  });

  test('does not make a student row clickable when the student has no paste activity and Reporter is off', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.pasteAlert.deleteMany({
        where: { membershipId: e2eContext.membershipId },
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/my-classes/${e2eContext.classId}?tab=students`);
      await page.waitForLoadState('networkidle');

      const studentRow = page
        .getByRole('row')
        .filter({ hasText: e2eContext.userEmail });
      await expect(studentRow).toBeVisible();
      await studentRow.click();

      // No sheet opens — the row isn't a trigger for a student with nothing to show.
      await expect(page.getByRole('dialog')).toHaveCount(0);
    } finally {
      await prisma.$disconnect();
    }
  });
});
