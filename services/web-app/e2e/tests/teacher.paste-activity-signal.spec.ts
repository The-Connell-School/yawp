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
    const fillerTitlePrefix = `Paste pagination filler ${suffix}`;
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

      await prisma.document.createMany({
        data: Array.from({ length: 25 }, (_, index) => ({
          title: `${fillerTitlePrefix} ${index + 1}`,
          text: 'Pagination fixture text.',
          html: '<p>Pagination fixture text.</p>',
          membershipId: e2eContext.membershipId,
          assignmentTypeId: e2eContext.assignmentTypeId,
          assignmentId: e2eContext.assignmentId,
          classAssignmentId: e2eContext.classAssignmentId,
        })),
      });

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

      await signIn(
        e2eContext.teacherEmail,
        process.env.E2E_TEACHER_PASSWORD ?? 'teacher-e2e-password'
      );
      await page.addInitScript(() => {
        localStorage.removeItem('yawp.student-work-view');
      });

      await page.goto('/app/documents?group=none');
      await page.waitForLoadState('networkidle');

      const pasteBadge = page
        .getByRole('row', { name: new RegExp(`Paste signal essay ${suffix}`) })
        .getByRole('button', { name: /Paste · 1; 1 unreviewed event/ });
      await expect(pasteBadge).toBeVisible();

      // Writing signals filter narrows to documents with paste activity.
      await page.getByRole('button', { name: /^Filter/ }).click();
      await page
        .getByTestId('teacher-document-work-writing-signal-select')
        .click();
      await page
        .getByRole('option', { name: 'Unreviewed paste activity' })
        .click();
      await page.waitForLoadState('networkidle');
      await expect(pasteBadge).toBeVisible();
      expect(page.url()).toContain('writingSignal=unreviewed');

      // Opening the badge shows the sheet without navigating away from the queue.
      await pasteBadge.click();
      await expect(
        page.getByRole('heading', { name: 'Paste activity' })
      ).toBeVisible();
      await expect(page.getByText(/412 characters pasted/)).toBeVisible();
      await expect(
        page.getByText('This long pasted passage was detected by the editor.')
      ).toBeVisible();
      expect(page.url()).toContain('/app/documents');

      // Changing writing signals from a later class page resets pagination so
      // the matching row cannot be stranded on an empty stale page.
      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=documents&documentGroup=none`
      );
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'go forward' }).click();
      await expect(
        page.getByRole('button', { name: 'go back' })
      ).toBeEnabled();
      await page.getByRole('button', { name: /^Filter/ }).click();
      await page
        .getByTestId('teacher-document-work-writing-signal-select')
        .click();
      await page
        .getByRole('option', { name: 'Unreviewed paste activity' })
        .click();
      await expect(
        page.getByRole('row', {
          name: new RegExp(`Paste signal essay ${suffix}`),
        })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'go back' })
      ).toBeDisabled();

      await page.goto('/app/documents?group=none&writingSignal=unreviewed');
      await page.waitForLoadState('networkidle');
      await page
        .getByRole('row', { name: new RegExp(`Paste signal essay ${suffix}`) })
        .getByRole('button', { name: /Paste · 1; 1 unreviewed event/ })
        .click();
      await page.getByRole('button', { name: 'Mark reviewed' }).click();
      await expect(
        page
          .getByTestId('paste-alert-row')
          .getByText('Reviewed', { exact: true })
      ).toBeVisible();

      await page.reload();
      await page.waitForLoadState('networkidle');

      const reviewed = await prisma.pasteAlert.findUnique({
        where: { id: alertId },
        select: { reviewedAt: true, reviewedByMembershipId: true },
      });
      expect(reviewed?.reviewedAt).not.toBeNull();
      expect(reviewed?.reviewedByMembershipId).toBeTruthy();

      // The class Documents surface shows the persisted reviewed state too.
      await page.goto(
        `/app/my-classes/${e2eContext.classId}?tab=documents&writingSignal=any`
      );
      await page.waitForLoadState('networkidle');
      const classPasteBadge = page
        .getByRole('row', { name: new RegExp(`Paste signal essay ${suffix}`) })
        .getByRole('button', { name: /Paste · 1; all reviewed/ });
      await expect(classPasteBadge).toBeVisible();
      await classPasteBadge.click();
      await expect(
        page
          .getByTestId('paste-alert-row')
          .getByText('Reviewed', { exact: true })
      ).toBeVisible();

      // The same queue and sheet remain usable at a narrow viewport.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(
        page
          .getByRole('row', { name: new RegExp(`Paste signal essay ${suffix}`) })
          .getByRole('button', { name: /Paste · 1; all reviewed/ })
      ).toBeVisible();
      await page
        .getByRole('row', { name: new RegExp(`Paste signal essay ${suffix}`) })
        .getByRole('button', { name: /Paste · 1; all reviewed/ })
        .click();
      await expect(
        page
          .getByTestId('paste-alert-row')
          .getByText('Reviewed', { exact: true })
      ).toBeVisible();
    } finally {
      if (alertId) {
        await prisma.pasteAlert
          .deleteMany({ where: { id: alertId } })
          .catch(() => {});
      }
      if (documentId) {
        await prisma.document
          .deleteMany({ where: { id: documentId } })
          .catch(() => {});
      }
      await prisma.document
        .deleteMany({ where: { title: { startsWith: fillerTitlePrefix } } })
        .catch(() => {});
      await prisma.$disconnect();
    }
  });
});
