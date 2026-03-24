import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import {
  ensureDocumentUnsubmitted,
  setDocumentSubmissionForSchool,
} from '../db-helpers';

test.describe.serial('Teacher submitting document for student', () => {
  test('teacher can submit unsubmitted student document', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await ensureDocumentUnsubmitted({
        prisma,
        documentId: e2eContext.documentId,
      });
      await setDocumentSubmissionForSchool({
        prisma,
        schoolId: e2eContext.schoolId,
        enabled: true,
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/documents/${e2eContext.documentId}`);
      await page.waitForLoadState('networkidle');

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
        where: { id: e2eContext.documentId },
        select: { submittedAt: true },
      });
      expect(doc?.submittedAt).not.toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });

  test('teacher can edit student document title', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/documents/${e2eContext.documentId}`);
      await page.waitForLoadState('networkidle');

      const titleInput = page.getByTestId('document-title-input');
      await expect(titleInput).toBeVisible({ timeout: 10000 });
      await titleInput.fill('Teacher-renamed document');
      await titleInput.blur();

      await page.waitForTimeout(1500);

      const doc = await prisma.document.findUnique({
        where: { id: e2eContext.documentId },
        select: { title: true },
      });
      expect(doc?.title).toBe('Teacher-renamed document');
    } finally {
      await prisma.$disconnect();
    }
  });
});
