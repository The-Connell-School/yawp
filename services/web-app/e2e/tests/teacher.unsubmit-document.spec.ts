import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Teacher unsubmits a document', () => {
  test('requires confirmation, then hides the submission without deleting the document', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();

    // Sanity check the fixture before mutating anything.
    const before = await prisma.document.findUnique({
      where: { id: e2eContext.submittedDocumentId },
      select: { id: true, deletedAt: true, text: true },
    });
    expect(before).not.toBeNull();
    expect(before?.deletedAt).toBeNull();

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/submissions/${e2eContext.submittedSubmissionId}`);
    await page.waitForLoadState('networkidle');

    const unsubmitButton = page.getByTestId('submission-lifecycle-unsubmit');
    await expect(unsubmitButton).toBeVisible();
    await unsubmitButton.click();

    // Confirmation dialog gates the destructive action.
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(/document itself is not deleted/i)
    ).toBeVisible();

    // Cancel first — must not unsubmit.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    const stillSubmitted = await prisma.submission.findUnique({
      where: { id: e2eContext.submittedSubmissionId },
      select: { unsubmittedAt: true },
    });
    expect(stillSubmitted?.unsubmittedAt).toBeNull();

    // Now actually confirm.
    await unsubmitButton.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Unsubmit' }).click();

    await page.waitForURL('**/app/documents**', { timeout: 15000 });

    const submission = await prisma.submission.findUnique({
      where: { id: e2eContext.submittedSubmissionId },
      select: {
        unsubmittedAt: true,
        unsubmittedByMembershipId: true,
        html: true,
        text: true,
      },
    });
    expect(submission?.unsubmittedAt).not.toBeNull();
    expect(submission?.unsubmittedByMembershipId).toBe(
      e2eContext.teacherMembershipId
    );
    // The submission row itself (its own snapshot html/text) is untouched.
    expect(submission?.html).toContain('importance of reading');

    const document = await prisma.document.findUnique({
      where: { id: e2eContext.submittedDocumentId },
      select: { id: true, deletedAt: true, text: true, html: true },
    });
    expect(document).not.toBeNull();
    expect(document?.deletedAt).toBeNull();
    expect(document?.text).toBe(before?.text);

    const revisionCount = await prisma.documentRevision.count({
      where: { documentId: e2eContext.submittedDocumentId },
    });
    expect(revisionCount).toBeGreaterThanOrEqual(0);
  });

  test('student sees the document as a draft again, not a submitted pill', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    const card = page.locator('a', {
      has: page.getByText('E2E Document workspace title'),
    });
    await expect(card).toBeVisible();
    await expect(card.getByText('Submitted', { exact: true })).toHaveCount(0);

    await card.click();
    await page.waitForURL(
      `**/app/documents/${e2eContext.submittedDocumentId}**`,
      { timeout: 15000 }
    );
  });
});
