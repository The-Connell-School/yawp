import { test, expect } from '../test-setup';

const UNRELEASED_INLINE_COMMENT =
  'Your opening sentence gives the reader a clear entry point.';

test.describe.serial('Unreleased grade privacy in student loader responses', () => {
  test('student submission response omits unreleased scores and feedback', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    const response = await page.request.get(
      `/app/submissions/${e2eContext.unreleasedGradedSubmissionId}`
    );
    expect(response.ok()).toBe(true);
    const body = await response.text();

    expect(body).not.toMatch(/"numericPercentage"\s*:\s*80\b/);
    expect(body).not.toMatch(/"letterGrade"\s*:\s*"B"/);
    expect(body).not.toContain('80%');
    expect(body).not.toContain(UNRELEASED_INLINE_COMMENT);
    expect(body).not.toContain('grade-comment-mark');
  });

  test('after release, student submission response includes grade and feedback', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    const form = new FormData();
    form.set('submissionIds', e2eContext.unreleasedGradedSubmissionId);
    const release = await page.request.post('/api/domain/release-grades', {
      multipart: form,
    });
    expect(release.ok()).toBe(true);

    await signIn(e2eContext.userEmail, 'johndoe');
    const response = await page.request.get(
      `/app/submissions/${e2eContext.unreleasedGradedSubmissionId}`
    );
    expect(response.ok()).toBe(true);
    const body = await response.text();

    expect(body).toContain('80%');
    expect(body).toContain(UNRELEASED_INLINE_COMMENT);
  });
});
