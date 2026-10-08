/** Confirm the submission lifecycle Release Grade dialog (not just open it). */
export async function releaseGradeFromSubmissionPage(
  page,
  { previewUrl, classId, exitAssignmentId }
) {
  const releaseTrigger = page.getByTestId('submission-lifecycle-release');
  if (await releaseTrigger.isVisible().catch(() => false)) {
    await releaseTrigger.click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: /^Release$/ }).click({ timeout: 15_000 });
    await page.getByText('Released').first().waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    return;
  }

  const releaseGrade = page.getByRole('button', { name: /Release Grade/i });
  if (await releaseGrade.isVisible().catch(() => false)) {
    await releaseGrade.click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: /^Release$/ }).click({ timeout: 15_000 });
    await page.getByText('Released').first().waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    return;
  }

  await page.goto(
    `${previewUrl}/app/my-classes/${classId}/assignments/${exitAssignmentId}`
  );
  await page.waitForLoadState('networkidle');
  const gradedTab = page.getByRole('button', { name: /graded/i });
  if (await gradedTab.isVisible().catch(() => false)) {
    await gradedTab.click();
    await page.getByRole('checkbox').first().check();
    await page.getByRole('button', { name: /release grades/i }).click();
    await page.waitForLoadState('networkidle');
  }
}

export async function waitForReleasedGradeOnStudentSubmission(page) {
  await page.getByText(/85%\s*\(B\)|9\s*\/\s*10/i).first().waitFor({
    state: 'visible',
    timeout: 60_000,
  });
}
