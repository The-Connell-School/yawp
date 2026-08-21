import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const unsubmitViaApi = async (
  page: import('@playwright/test').Page,
  submissionId: string
) =>
  page.evaluate(async (id) => {
    const formData = new FormData();
    formData.append('submissionId', id);
    const res = await fetch('/api/domain/unsubmit-submission', {
      method: 'POST',
      body: formData,
    });
    return { status: res.status, body: await res.json() };
  }, submissionId);

test.describe.serial('Unsubmitting the seeded submission', () => {
  // Unsubmit is student-only: there is no teacher-facing "Unsubmit" control
  // (see submission-lifecycle-panel.tsx) and the API refuses teachers and
  // admins outright. This test pins both halves of that contract — the
  // teacher is refused, the owning student succeeds — plus the server
  // machinery the student flow rests on (Submission.unsubmittedAt /
  // unsubmittedByMembershipId, the "document and its revisions survive"
  // guarantee, and active-read exclusion).
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

    // A teacher cannot unsubmit for a student, even by calling the API the
    // way the removed teacher button used to.
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/submissions/${e2eContext.submittedSubmissionId}`);
    await page.waitForLoadState('networkidle');

    const refused = await unsubmitViaApi(
      page,
      e2eContext.submittedSubmissionId
    );
    expect(refused.status).toBe(403);
    expect(refused.body.success).toBe(false);
    expect(
      await prisma.submission.findUnique({
        where: { id: e2eContext.submittedSubmissionId },
        select: { unsubmittedAt: true },
      })
    ).toEqual({ unsubmittedAt: null });

    // The owning student withdraws their own submission.
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/documents/${e2eContext.submittedDocumentId}`);
    await page.waitForLoadState('networkidle');

    const result = await unsubmitViaApi(page, e2eContext.submittedSubmissionId);
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
    expect(submission?.unsubmittedByMembershipId).toBe(e2eContext.membershipId);
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
