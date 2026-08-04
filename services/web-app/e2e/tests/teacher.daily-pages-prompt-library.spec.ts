import { test, expect } from '../test-setup';

test.describe.serial('Daily Pages prompt library', () => {
  test('teacher can prefill an assignment from the prompt library without changing the default blank path', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await expect(
      page.getByRole('heading', { name: 'Daily Pages', level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'How Daily Pages works' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Prompt Library/i })
    ).toBeVisible();

    await page.getByRole('button', { name: /Prompt Library/i }).click();
    await expect(page.getByPlaceholder('Search prompts')).toBeVisible();
    await page.getByPlaceholder('Search prompts').fill('captain of my destiny');
    await page.keyboard.press('Enter');

    const prompt = page.getByText(
      'I am the captain of my destiny. Agree or disagree and explain your rationale.'
    );
    await expect(prompt).toBeVisible();
    await prompt.click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
      'I am the captain of my destiny. Agree or disagree and explain your rationale.'
    );
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue('');
  });

  test('student does not see teacher-only Daily Pages prompt library', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await expect(
      page.getByRole('heading', { name: 'Daily Pages', level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'How Daily Pages works' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Prompt Library/i })
    ).toHaveCount(0);
  });
});
