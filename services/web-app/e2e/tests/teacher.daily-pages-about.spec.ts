import { test, expect } from '../test-setup';

/**
 * The Daily Pages assignment-type page has to answer "what is this and how do
 * I use it" before it answers "how do I browse the prompts". A teacher who
 * only ever sees the library directions learns how to click a prompt, not how
 * to write one — and writing their own is the thing they will do most.
 *
 * All of that read end to end is a page and a half, so only the blurb is open
 * and the rest waits behind a heading until a teacher asks for it.
 */
test.describe.serial('Daily Pages about section', () => {
  test('opens with the blurb, with every other section collapsed', async ({
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
      page.getByText(/^Daily Pages is low-stakes writing practice:/)
    ).toBeVisible();

    for (const section of [
      'What a Daily Pages entry is',
      'What it is not',
      'How it is graded',
      'Using it with a class',
      'Writing your own prompt',
      'Prompt library',
    ]) {
      await expect(
        page.getByRole('button', { name: section, exact: true })
      ).toHaveAttribute('aria-expanded', 'false');
    }

    // Collapsed means collapsed: the copy inside is not on screen yet.
    await expect(page.getByText('Not a formal essay paragraph.')).toHaveCount(
      0
    );
    await expect(page.getByText('Name the prompt clearly.')).toHaveCount(0);
    // Not "Claim and defend" — the kind labels also live in the prompt grid's
    // filters below, so the directions' own opening line is what to check.
    await expect(page.getByText('Browse the prompts below')).toHaveCount(0);

    // The Modules section is gone from this page: its one module is a
    // freewrite-era blurb the about section contradicts.
    await expect(page.getByRole('button', { name: 'Modules' })).toHaveCount(0);
  });

  test('a section opens when its heading is clicked', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    // Daily Pages is engagement practice, with no grammar scoring.
    await page.getByRole('button', { name: 'What it is not' }).click();
    await expect(page.getByText('Not a formal essay paragraph.')).toBeVisible();

    // The current engagement rubric uses tiers rather than category weights.
    await page.getByRole('button', { name: 'How it is graded' }).click();
    const grading = page.getByRole('row', { name: /Excellent/ });
    await expect(grading).toBeVisible();
    await expect(grading).toContainText('100% — the full total');

    // Sections open independently — the first one stays open.
    await expect(page.getByText('Not a formal essay paragraph.')).toBeVisible();
  });

  test('the prompt-writing section carries the recipe and a rewrite', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await page.getByRole('button', { name: 'Writing your own prompt' }).click();

    await expect(page.getByText('Name the prompt clearly.')).toBeVisible();
    await expect(page.getByText('Write about chapter 4.')).toBeVisible();
    await expect(
      page.getByText('Signs a prompt will not grade well')
    ).toBeVisible();
  });

  test('the library directions are the last section, not a second card', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await page
      .getByRole('button', { name: 'Prompt library', exact: true })
      .click();

    await expect(
      page.getByRole('button', { name: 'Prompt library', exact: true })
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByText('For inspiration', { exact: true })
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
      page.getByRole('button', { name: 'Writing your own prompt' })
    ).toHaveCount(0);
  });
});
