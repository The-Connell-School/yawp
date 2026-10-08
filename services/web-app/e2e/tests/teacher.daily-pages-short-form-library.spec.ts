import { test, expect } from '../test-setup';

/**
 * The swap that makes the split visible: Daily Pages reads the graded
 * short-form corpus, Class Starter keeps the freewrite one. Sharing a single
 * library was the thing that made the two assignment types look identical.
 */
test.describe.serial('Daily Pages short-form prompt library', () => {
  test('Daily Pages shows the short-form library, not the freewrite one', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await expect(
      page.getByRole('heading', { name: 'About Daily Pages' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'How Class Starter works' })
    ).toHaveCount(0);

    await page.getByRole('button', { name: /Prompt Library/i }).first().click();
    await expect(page.getByPlaceholder(/Search prompts/)).toBeVisible();

    // A freewrite prompt has no business in the graded corpus.
    await expect(
      page.getByText(
        'I am the captain of my destiny. Agree or disagree and explain your rationale.'
      )
    ).toHaveCount(0);
  });

  test('a short-form prompt prefills the assignment sheet', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /Prompt Library/i }).first().click();
    await page.getByPlaceholder(/Search prompts/).fill('counterexample');
    await page.keyboard.press('Enter');

    const prompt = page.getByText('Honest and kind at once');
    await expect(prompt).toBeVisible();
    await prompt.click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
      /hardest counterexample/
    );
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('student does not see the teacher-only Daily Pages library', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await expect(
      page.getByRole('heading', { name: 'About Daily Pages' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Prompt Library/i })
    ).toHaveCount(0);
  });
});
