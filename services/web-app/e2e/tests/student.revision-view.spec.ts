import { test, expect } from '../test-setup';

test.describe.serial('Student side-by-side revision view', () => {
  test('Revise Essay button navigates to the revision view', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/submissions/${e2eContext.gradeId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('link', { name: 'Revise Essay' }).click();

    await page.waitForURL(
      `**/app/submissions/${e2eContext.gradeId}/revise`,
      { timeout: 10000 }
    );
    await expect(page).toHaveURL(
      new RegExp(`/app/submissions/${e2eContext.gradeId}/revise`)
    );
  });

  test('Revision view renders feedback panel on the left and editor on the right', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/submissions/${e2eContext.gradeId}/revise`);
    await page.waitForLoadState('networkidle');

    // Left feedback panel is present
    await expect(page.getByTestId('revision-feedback-panel')).toBeVisible();

    // Grade info is visible in the feedback panel
    await expect(
      page.getByTestId('revision-feedback-panel').getByText('77%')
    ).toBeVisible();

    // Submitted essay text is visible
    await expect(
      page.getByTestId('revision-feedback-panel').getByText(
        'Education is the foundation of society.'
      )
    ).toBeVisible();

    // Right editor panel is present
    await expect(page.getByTestId('revision-editor-panel')).toBeVisible();
  });

  test('Revision view nav has a back link and submit button', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/submissions/${e2eContext.gradeId}/revise`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('link', { name: /back to feedback/i })
    ).toBeVisible();

    await expect(
      page.getByRole('button', { name: /submit revised version/i })
    ).toBeVisible();
  });

  test('does not expose revision flow before feedback is released', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');

    await page.goto(`/app/submissions/${e2eContext.unreleasedGradedSubmissionId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: 'Revise Essay' })).toHaveCount(0);

    await page.goto(`/app/submissions/${e2eContext.unreleasedGradedSubmissionId}/revise`);
    await page.waitForURL(
      `**/app/submissions/${e2eContext.unreleasedGradedSubmissionId}`,
      { timeout: 10000 }
    );
    await expect(page.getByTestId('revision-feedback-panel')).toHaveCount(0);
  });
});
