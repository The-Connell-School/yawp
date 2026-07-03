import { test, expect } from '../test-setup';

test.describe.serial('Student reads teacher feedback on a released grade', () => {
  test('dashboard document card opens the graded submission', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    await page.getByRole('link', { name: /graded document/i }).click();
    await page.waitForURL(`**/app/submissions/${e2eContext.gradeId}**`, {
      timeout: 15000,
    });

    await expect(
      page.locator('nav').getByText('Graded', { exact: true })
    ).toBeVisible();
  });

  test('direct document url redirects student to released submission', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(
      `/app/documents/${e2eContext.gradedDocumentId}?ssv=1&exitTo=%2Fapp`
    );
    await page.waitForURL(`**/app/submissions/${e2eContext.gradeId}**`, {
      timeout: 15000,
    });

    await expect(
      page.locator('nav').getByText('Graded', { exact: true })
    ).toBeVisible();
  });

  test('graded submission page shows grade, overall comment, rubric, and inline comments', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/submissions/${e2eContext.gradeId}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('nav').getByText('Graded', { exact: true })
    ).toBeVisible();

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

    await expect(page.locator('.grammar-issue-mark')).toHaveCount(1);

    await page.getByTestId('toggle-grammar-highlights').click();
    await expect(page.locator('.grammar-issue-mark')).toHaveCount(0);
    await expect(page.locator('.grade-comment-mark')).not.toHaveCount(0);

    await page.getByTestId('toggle-grammar-highlights').click();
    await expect(page.locator('.grammar-issue-mark')).toHaveCount(1);
  });
});
