import { test, expect } from '../test-setup';

/**
 * Daily Pages "Paragraph type" and "Time students have to write" were removed
 * before release, along with their feature flag. The creation form offers
 * neither, exactly as every school has seen it.
 */
test.describe.serial('Daily Pages writing conditions removed', () => {
  test('Daily Pages offers neither paragraph type nor writing time', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );
    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Prompt', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Paragraph type')).toHaveCount(0);
    await expect(page.getByLabel('Time students have to write')).toHaveCount(0);
  });
});
