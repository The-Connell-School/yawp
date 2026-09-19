import { test, expect } from '../test-setup';

/**
 * The Daily Pages assignment-type page has to answer "what is this and how do
 * I use it" before it answers "how do I browse the prompts". A teacher who
 * only ever sees the library directions learns how to click a prompt, not how
 * to write one — and writing their own is the thing they will do most.
 */
test.describe.serial('Daily Pages about section', () => {
  test('a teacher sees what Daily Pages is, how it is graded, and how to write a prompt', async ({
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

    for (const heading of [
      'What a Daily Pages entry is',
      'What it is not',
      'How it is graded',
      'Using it with a class',
      'Writing your own prompt',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }

    // The line that separates it from a Class Starter has to be on the page in
    // so many words; it is the single thing teachers get wrong.
    await expect(page.getByText('Not a warm-up.')).toBeVisible();

    // The weights come from the rubric itself, so a teacher reading this is
    // reading what the assistant actually does.
    const grading = page.getByRole('row', { name: /Depth of Thought/ });
    await expect(grading).toBeVisible();
    await expect(grading).toContainText('35%');

    // The prompt recipe, and the rewrite that shows it working.
    await expect(page.getByText('Ask for the backing')).toBeVisible();
    await expect(
      page.getByText('What did you think of Chapter 4?')
    ).toBeVisible();

    // The library directions stay: the about section is added above them, not
    // swapped in for them.
    await expect(
      page.getByRole('heading', { name: 'How the Daily Pages library works' })
    ).toBeVisible();
  });

  test('a student does not see the teacher-facing about section', async ({
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
      page.getByRole('heading', { name: 'Writing your own prompt' })
    ).toHaveCount(0);
  });
});
