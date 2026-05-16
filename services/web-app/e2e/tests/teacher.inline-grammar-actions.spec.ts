import { test, expect } from '../test-setup';

test.describe.serial('Inline grammar issue actions', () => {
  test('teacher grading view can remove a grammar issue from the inline tooltip', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/submissions/${e2eContext.gradeId}?edit=1`);
    await page.waitForLoadState('networkidle');

    const grammarMark = page.locator('.grammar-issue-mark').first();
    await expect(grammarMark).toBeVisible();

    await grammarMark.hover();
    const removeButton = page.getByRole('button', { name: /^remove comment$/i });
    await expect(removeButton).toBeVisible();

    await removeButton.click();
    await expect(removeButton).toHaveCount(0);
    await expect(page.locator('.grammar-issue-mark')).toHaveCount(0);
  });

  test('student released view shows grammar tooltip without teacher-only action', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/submissions/${e2eContext.gradeId}`);
    await page.waitForLoadState('networkidle');

    const grammarMark = page.locator('.grammar-issue-mark').first();
    await expect(grammarMark).toBeVisible();

    await grammarMark.hover();
    await expect(page.getByText('E2E grammar highlight for student toggle.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^remove comment$/i })
    ).toHaveCount(0);
  });
});
