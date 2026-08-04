import { test, expect } from '../test-setup';

test.describe.serial('Writing practice prototype', () => {
  test('keeps writing practice off the student dashboard', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await expect(
      page.getByRole('link', { name: /writing practice/i })
    ).toHaveCount(0);
  });

  test('loads lessons by direct URL and supports a self-guided practice check', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    await expect(
      page.getByRole('heading', { name: /writing practice/i })
    ).toBeVisible();
    await expect(page.getByText(/self-guided practice/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /revising for wordiness/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /comma splices/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /pronoun agreement/i })
    ).toBeVisible();

    await page.getByRole('link', { name: /revising for wordiness/i }).click();

    await expect(
      page.getByRole('heading', { name: 'Revising for Wordiness' })
    ).toBeVisible();
    await expect(page.getByText(/practice prompt/i)).toBeVisible();
    await expect(
      page.getByRole('complementary').getByText('At this point in time')
    ).toBeVisible();

    await page
      .getByLabel(/your practice response/i)
      .fill('We cannot accept new applications now.');
    await page.getByRole('button', { name: /check response/i }).click();

    await expect(page.getByText(/score preview/i)).toBeVisible();
    await expect(page.getByText(/ready for tutor review/i)).toBeVisible();
    await page.getByRole('button', { name: /try another prompt/i }).click();
    await expect(page.getByText(/weak construction/i)).toBeVisible();
  });
});
