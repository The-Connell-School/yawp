import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { ensureDocumentUnsubmitted } from '../db-helpers';

test.describe.serial('Teacher submitting document for student', () => {
  test('teacher can submit unsubmitted student document', async ({
    page,
    e2eContext,
    signIn,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await ensureDocumentUnsubmitted({
        prisma,
        documentId: e2eContext.editedDocumentId,
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await helpers.openDocument(e2eContext.editedDocumentId);

      await expect(page.getByTestId('document-submit-button')).toBeVisible({
        timeout: 10000,
      });
      await page.getByTestId('document-submit-button').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByTestId('document-finalize-submit').click();

      await expect(page.getByText('Submitted').first()).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByTestId('document-submit-button')).toHaveCount(0);

      const doc = await prisma.document.findUnique({
        where: { id: e2eContext.editedDocumentId },
        select: { submissions: { take: 1, select: { id: true } } },
      });
      expect(doc?.submissions.length).toBeGreaterThan(0);
    } finally {
      await prisma.$disconnect();
    }
  });
});
