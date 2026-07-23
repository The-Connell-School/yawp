import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe('Teacher paste activity signal', () => {
  test('teacher can see, filter, review, and persist paste activity on a document', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const suffix = Date.now().toString(36);
    let documentId = '';
    let alertId = '';

    try {
      const document = await prisma.document.create({
        data: {
          title: `Paste signal essay ${suffix}`,
          text: 'Original student text.',
          html: '<p>Original student text.</p>',
          membershipId: e2eContext.membershipId,
          assignmentTypeId: e2eContext.assignmentTypeId,
          assignmentId: e2eContext.assignmentId,
          classAssignmentId: e2eContext.classAssignmentId,
        },
        select: { id: true },
      });
      documentId = document.id;

      const alert = await prisma.pasteAlert.create({
        data: {
          documentId,
          membershipId: e2eContext.membershipId,
          textLength: 412,
          content: 'This long pasted passage was detected by the editor.',
        },
        select: { id: true },
      });
      alertId = alert.id;

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.addInitScript(() => {
        localStorage.removeItem('yawp.student-work-view');
      });

      await page.goto('/app/documents?group=none');
      await page.waitForLoadState('networkidle');

      const pasteBadge = page.getByRole('button', { name: /Paste · 1/ });
      await expect(pasteBadge).toBeVisible();

      // Writing signals filter narrows to documents with paste activity.
      await page.getByRole('button', { name: /^Filter/ }).click();
      await page
        .getByTestId('teacher-document-work-writing-signal-select')
        .click();
      await page.getByRole('option', { name: 'Unreviewed paste activity' }).click();
      await page.waitForLoadState('networkidle');
      await expect(pasteBadge).toBeVisible();
      expect(page.url()).toContain('writingSignal=unreviewed');

      // Opening the badge shows the sheet without navigating away from the queue.
      await pasteBadge.click();
      await expect(page.getByText('Paste activity')).toBeVisible();
      await expect(page.getByText(/412 characters pasted/)).toBeVisible();
      await expect(
        page.getByText('This long pasted passage was detected by the editor.')
      ).toBeVisible();
      expect(page.url()).toContain('/app/documents');

      await page.getByRole('button', { name: 'Mark reviewed' }).click();
      await expect(page.getByText('Reviewed')).toBeVisible();

      await page.reload();
      await page.waitForLoadState('networkidle');

      const reviewed = await prisma.pasteAlert.findUnique({
        where: { id: alertId },
        select: { reviewedAt: true, reviewedByMembershipId: true },
      });
      expect(reviewed?.reviewedAt).not.toBeNull();
      expect(reviewed?.reviewedByMembershipId).toBeTruthy();
    } finally {
      if (alertId) {
        await prisma.pasteAlert.deleteMany({ where: { id: alertId } }).catch(() => {});
      }
      if (documentId) {
        await prisma.document
          .deleteMany({ where: { id: documentId } })
          .catch(() => {});
      }
      await prisma.$disconnect();
    }
  });
});
