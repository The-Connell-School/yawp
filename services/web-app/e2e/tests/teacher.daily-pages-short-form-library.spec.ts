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
      page.getByRole('heading', { name: 'How the Daily Pages library works' })
    ).toBeVisible();
    // The Class Starter directions must not appear here — that heading showing
    // up would mean Daily Pages is still borrowing the freewrite corpus.
    await expect(
      page.getByRole('heading', { name: 'How Class Starter works' })
    ).toHaveCount(0);

    await page.getByRole('button', { name: /Prompt Library/i }).click();
    await expect(page.getByPlaceholder('Search prompts')).toBeVisible();

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

    await page.getByRole('button', { name: /Prompt Library/i }).click();
    await page.getByPlaceholder('Search prompts').fill('counterexample');
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

  /**
   * The Cognitive mode filter offers the paragraph types a teacher can
   * assign, and no others — they roll out together.
   */
  test('the Cognitive mode filter offers only switched-on paragraph types', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /Prompt Library/i }).click();
    await page.getByRole('button', { name: /Cognitive mode/i }).click();

    await expect(
      page.getByRole('checkbox', { name: /^Analyze/ })
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: /^Argue a position/ })
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: /^Compare/ })
    ).toBeVisible();
    for (const hidden of [
      'Define a term',
      'Evaluate',
      'Interpret',
      'Synthesize',
    ]) {
      await expect(
        page.getByRole('checkbox', { name: new RegExp(`^${hidden}`) })
      ).toHaveCount(0);
    }
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
      page.getByRole('heading', { name: 'How the Daily Pages library works' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Prompt Library/i })
    ).toHaveCount(0);
  });
});
