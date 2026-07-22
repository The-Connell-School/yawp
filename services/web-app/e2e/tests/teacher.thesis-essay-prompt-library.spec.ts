import { test, expect } from '../test-setup';

test.describe.serial('Thesis-Driven Essay prompt library', () => {
  test('teacher can prefill an assignment from the thesis prompt library without changing the default blank path', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );

    await expect(
      page.getByRole('heading', { name: 'The Thesis-Driven Essay', level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'How the Thesis-Driven Essay library works',
      })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Prompt Library/i })
    ).toBeVisible();

    await page.getByRole('button', { name: /Prompt Library/i }).click();
    await expect(page.getByPlaceholder('Search prompts')).toBeVisible();
    await page.getByPlaceholder('Search prompts').fill('Romeo and Juliet');
    await page.keyboard.press('Enter');

    const prompt = page.getByRole('heading', {
      name: 'Romeo and Juliet',
      level: 3,
    });
    await expect(prompt).toBeVisible();
    await prompt.click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
      /thesis-driven critical essay on Romeo and Juliet/
    );
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue('');
  });

  test('student does not see the teacher-only thesis prompt library', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );

    await expect(
      page.getByRole('heading', { name: 'The Thesis-Driven Essay', level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'How the Thesis-Driven Essay library works',
      })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Prompt Library/i })
    ).toHaveCount(0);
  });
});
