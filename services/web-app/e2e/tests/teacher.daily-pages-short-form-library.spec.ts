import { test, expect } from '../test-setup';

/**
 * With the split flag off — which is how e2e runs — Daily Pages keeps the
 * open-ended freewrite library it has always had, and Class Starter gets its
 * own copy of it. The short-form library only replaces the freewrite one for
 * Daily Pages once DAILY_PAGES_SPLIT_ENABLED is on, so that swap is asserted
 * from the pure resolver in library-variant.test.ts rather than here.
 */
test.describe.serial('Daily Pages library while the split is off', () => {
  test('Daily Pages still shows the open-ended library and its directions', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await expect(
      page.getByRole('heading', { name: 'How Daily Pages works' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'How the Daily Pages library works' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Prompt Library/i })
    ).toBeVisible();
  });

  test('a Class Starter prompt still prefills the assignment sheet', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /Prompt Library/i }).click();
    await page.getByPlaceholder('Search prompts').fill('captain of my destiny');
    await page.keyboard.press('Enter');

    const prompt = page.getByText(
      'I am the captain of my destiny. Agree or disagree and explain your rationale.'
    );
    await expect(prompt).toBeVisible();
    await prompt.click();

    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
      'I am the captain of my destiny. Agree or disagree and explain your rationale.'
    );
  });
});
