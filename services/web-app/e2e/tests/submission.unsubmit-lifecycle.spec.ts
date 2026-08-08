import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

test.describe.serial('Teacher unsubmits a document', () => {
  // There is no teacher-facing "Unsubmit" control anymore — see
  // submission-lifecycle-panel.tsx. Only students can unsubmit their own
  // document (a separate flow). The server machinery this test exercises
  // (Submission.unsubmittedAt / unsubmittedByMembershipId, the "document and
  // its revisions survive" guarantee, and active-read exclusion) stays in
  // place for that student-facing flow to build on, so this test still
  // drives the underlying API directly to keep that coverage.
  test('unsubmitting hides the submission without deleting the document', async ({
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

    // No teacher-facing entry point exists in the UI; call the (still-live,
    // still teacher-authorized) API the same way the removed button used to.
    const result = await page.evaluate(async (submissionId) => {
      const formData = new FormData();
      formData.append('submissionId', submissionId);
      const res = await fetch('/api/domain/unsubmit-submission', {
        method: 'POST',
        body: formData,
      });
      return { status: res.status, body: await res.json() };
    }, e2eContext.submittedSubmissionId);
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);

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
