import { test, expect } from '../test-setup';

function assertNoSerializedField(
  body: string,
  field: string,
  value: number | string
) {
  const raw = String(value);
  expect(body).not.toMatch(new RegExp(`"${field}"\\s*:\\s*${raw}\\b`));
  expect(body).not.toMatch(new RegExp(`\\\\"${field}\\\\",${raw}\\b`));
  expect(body).not.toMatch(new RegExp(`"${field}",${raw}\\b`));
}

test.describe.serial('Unreleased grade privacy in student loader responses', () => {
  test('student submission and assignment-type data omit unreleased scores', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { gradePrivacy } = e2eContext;
    await signIn(e2eContext.userEmail, 'johndoe');

    const submissionHtml = await (
      await page.request.get(`/app/submissions/${gradePrivacy.submissionId}`)
    ).text();
    const submissionData = await (
      await page.request.get(
        `/app/submissions/${gradePrivacy.submissionId}.data`
      )
    ).text();

    for (const body of [submissionHtml, submissionData]) {
      assertNoSerializedField(body, 'numericPercentage', 80);
      assertNoSerializedField(body, 'overallScore', 80);
      expect(body).not.toContain(gradePrivacy.releaseComment);
      expect(body).not.toContain('grade-comment-mark');
    }

    const assignmentTypeData = await (
      await page.request.get(
        `/app/assignment-types/${gradePrivacy.assignmentTypeId}.data`
      )
    ).text();
    assertNoSerializedField(assignmentTypeData, 'overallScore', 85);
    assertNoSerializedField(assignmentTypeData, 'numericPercentage', 80);

    const dailyPagesData = await (
      await page.request.get(
        `/app/assignment-types/${gradePrivacy.dailyPagesAssignmentTypeId}.data`
      )
    ).text();
    assertNoSerializedField(
      dailyPagesData,
      'overallScore',
      gradePrivacy.dailyPagesUnreleasedOverallScore
    );
  });

  test('after release, student submission shows points and feedback', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { gradePrivacy } = e2eContext;
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    const form = new FormData();
    form.set('submissionIds', gradePrivacy.submissionId);
    const release = await page.request.post('/api/domain/release-grades', {
      multipart: form,
    });
    expect(release.ok()).toBe(true);

    await signIn(e2eContext.userEmail, 'johndoe');
    const submissionHtml = await (
      await page.request.get(`/app/submissions/${gradePrivacy.submissionId}`)
    ).text();
    const submissionData = await (
      await page.request.get(
        `/app/submissions/${gradePrivacy.submissionId}.data`
      )
    ).text();

    expect(submissionHtml).toContain('80 / 100');
    expect(submissionData).toMatch(/\\"numericPercentage\\",80\b|"numericPercentage"\s*:\s*80\b/);
    expect(submissionHtml).toContain(gradePrivacy.releaseComment);
  });
});
