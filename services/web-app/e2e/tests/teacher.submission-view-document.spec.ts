import { test, expect } from '../test-setup';

test.describe.serial('Teacher submission → document → exit', () => {
  test('round-trips to live document and back to same submission URL', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    const submissionPath = `/app/submissions/${e2eContext.submittedSubmissionId}`;
    const submissionWithQuery = `${submissionPath}?edit=0&exitTo=${encodeURIComponent('/app/my-classes/' + e2eContext.classId)}`;

    await page.goto(submissionWithQuery);
    await page.waitForLoadState('networkidle');

    const submissionPageUrl = page.url();

    await page.getByTestId('submission-view-document').click();
    await page.waitForURL(
      new RegExp(`/app/documents/${e2eContext.submittedDocumentId}`),
      { timeout: 15000 }
    );
    const docUrl = new URL(page.url());
    expect(docUrl.searchParams.get('exitTo')).toBeTruthy();

    await page.getByRole('button', { name: /^exit$/i }).click();
    await expect(page).toHaveURL(submissionPageUrl);
  });
});
