import { test, expect } from '../test-setup';

test.describe.serial('Student reads teacher feedback on a released grade', () => {
  test('graded submission page shows grade, overall comment, rubric, and inline comments', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/submissions/${e2eContext.gradeId}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /overall grade/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('paragraph').filter({ hasText: /^77%\s*\(C\+\)$/ })).toBeVisible();

    await expect(
      page.getByRole('heading', { name: /overall feedback/i })
    ).toBeVisible();
    await expect(
      page.getByText('Good effort with room for improvement.')
    ).toBeVisible();

    await expect(page.getByRole('heading', { name: /rubric/i })).toBeVisible();
    await expect(page.getByText(/Thesis And Content/i).first()).toBeVisible();
    await expect(page.getByText(/Organization And Structure/i).first()).toBeVisible();

    await expect(
      page.getByText('Strong thesis statement in the opening sentence.')
    ).toBeVisible();
    await expect(
      page.getByText(
        'Consider adding more specific examples to support your claims.'
      )
    ).toBeVisible();

    await expect(
      page.getByText('Education is the foundation of society.')
    ).toBeVisible();
  });
});
