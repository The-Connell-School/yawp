/** Reset the preview QA exit-ticket submission to graded-but-unreleased (preview DB only). */
export async function resetPreviewPlannerQaExitTicket(page) {
  const ok = await page.evaluate(async () => {
    const response = await fetch(
      '/auth/dev-reset-preview-planner-qa-exit-ticket',
      { method: 'POST' }
    );
    return response.ok;
  });
  if (!ok) {
    throw new Error(
      'failed to reset preview planner QA exit ticket (dev-reset route)'
    );
  }
}

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
    await page.getByTestId('grade-summary-released-label').waitFor({
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
    await page.getByTestId('grade-summary-released-label').waitFor({
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

export async function assertStudentSubmissionUnreleased(page) {
  if (await page.getByText(/85%\s*\(B\)|9\s*\/\s*10/i).isVisible().catch(() => false)) {
    throw new Error('student submission showed released grade before release step');
  }
  if (await page.getByText(/pending grade/i).isVisible().catch(() => false)) {
    return;
  }
  const teacherContext = page.getByRole('region', { name: 'Teacher Context' });
  if (await teacherContext.isVisible().catch(() => false)) {
    throw new Error('unreleased submission leaked teacher context to student');
  }
}

export async function assertTeacherSubmissionUnreleased(page) {
  if (await page.getByTestId('grade-summary-released-label').isVisible().catch(() => false)) {
    throw new Error('teacher view already shows Released before release step');
  }
  await page.getByTestId('submission-lifecycle-release').waitFor({
    state: 'visible',
    timeout: 60_000,
  });
}
