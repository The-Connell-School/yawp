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

  test('teacher can rename submission title in nav', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto(
      `/app/submissions/${e2eContext.submittedSubmissionId}?edit=0`
    );
    await page.waitForLoadState('networkidle');

    const input = page.getByTestId('submission-title-input');
    await expect(input).toBeVisible();
    await input.fill('E2E teacher title');
    await input.blur();

    await expect
      .poll(async () => input.inputValue(), { timeout: 10000 })
      .toBe('E2E teacher title');
  });
});
