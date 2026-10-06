import { test, expect } from '../test-setup';

/**
 * The kinds of paragraph a Daily Pages entry practices. Offered only for Daily
 * Pages, and only the types switched on — now all seven. A paragraph can
 * combine moves, so each type is a checkbox; with none ticked,
 * the entry grades and tutors as any kind of paragraph, as before.
 */
test.describe.serial('Paragraph type at assignment creation', () => {
  test('Daily Pages offers each switched-on type as a checkbox, none ticked by default', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const types = dialog.getByRole('group', { name: 'Paragraph types' });
    await expect(types.getByRole('checkbox')).toHaveCount(7);
    for (const name of [
      'Define a term',
      'Interpret',
      'Evaluate',
      'Synthesize',
    ]) {
      await expect(types.getByRole('checkbox', { name })).not.toBeChecked();
    }
    const analyze = types.getByRole('checkbox', { name: 'Analyze' });
    const argue = types.getByRole('checkbox', { name: 'Argue a position' });
    await expect(analyze).not.toBeChecked();
    await expect(argue).not.toBeChecked();
    const compare = types.getByRole('checkbox', { name: 'Compare' });
    await expect(compare).not.toBeChecked();
    await expect(types.getByText(/any kind of paragraph/)).toBeVisible();

    await analyze.check();
    await expect(types.getByText(/Claim-Evidence-Analysis/)).toBeVisible();

    // Both can be ticked: the paragraph combines the two moves.
    await argue.check();
    await expect(types.getByText(/Claim-Evidence-Analysis/)).toBeVisible();
    await expect(types.getByText(/Position-Reason-Test/)).toBeVisible();

    await compare.check();
    await expect(
      types.getByText(/Basis-Difference-Significance/)
    ).toBeVisible();

    await types.getByRole('checkbox', { name: 'Evaluate' }).check();
    await expect(types.getByText(/Judgment-Standard-Evidence/)).toBeVisible();
  });

  /**
   * A library prompt is tagged with the moves it asks for; picking one ticks
   * the switched-on types among them, and the teacher can change it.
   */
  test('picking a library prompt ticks its paragraph types', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /Prompt Library/i }).click();
    await page.getByPlaceholder('Search prompts').fill('Juliet');
    await page.keyboard.press('Enter');
    await page.getByText('Juliet argues with a name').first().click();

    const types = page
      .getByRole('dialog')
      .getByRole('group', { name: 'Paragraph types' });
    await expect(
      types.getByRole('checkbox', { name: 'Analyze' })
    ).toBeChecked();
    // The Juliet prompt is tagged Analyze and Interpret, and asks for no argument.
    await expect(
      types.getByRole('checkbox', { name: 'Interpret' })
    ).toBeChecked();
    await expect(
      types.getByRole('checkbox', { name: 'Argue a position' })
    ).not.toBeChecked();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  /** A prompt that was hidden until Compare switched on now shows, and ticks it. */
  test('a Compare library prompt ticks Compare', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /Prompt Library/i }).click();
    await page.getByPlaceholder('Search prompts').fill('different reasons');
    await page.keyboard.press('Enter');
    await page.getByText('Same want, different reason').first().click();

    const types = page
      .getByRole('dialog')
      .getByRole('group', { name: 'Paragraph types' });
    await expect(
      types.getByRole('checkbox', { name: 'Compare' })
    ).toBeChecked();
    await expect(
      types.getByRole('checkbox', { name: 'Analyze' })
    ).not.toBeChecked();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  /**
   * A teacher testing one type end to end starts a document that practices
   * it: New → Document asks which type, and the document is named for it.
   */
  test('New Document asks which paragraph type to practice', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Document' }).click();
    await expect(
      page.getByRole('menuitem', { name: 'Any kind of paragraph' })
    ).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Analyze' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Compare' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Argue a position' }).click();

    await page.waitForURL(/\/app\/documents\//);
    await expect(page.getByTestId('document-title-input')).toHaveValue(
      'Argue a position'
    );
  });

  /**
   * Under the About section, each switched-on type explains itself: the same
   * explanation a student opens from inside an assignment of that type. The
   * section is collapsed until a teacher opens it.
   */
  test('the Daily Pages page explains each kind of paragraph', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    const guides = page.getByTestId('paragraph-guides');
    await expect(
      guides.getByRole('heading', { name: /The kinds of paragraphs/ })
    ).toBeVisible();

    // Collapsed until a teacher asks: the types are named but not listed.
    const toggle = guides.getByRole('button', {
      name: /The kinds of paragraphs/,
    });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(guides.getByRole('button', { name: /^Analyze/ })).toHaveCount(
      0
    );

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await guides.getByRole('button', { name: /^Analyze/ }).click();
    await expect(guides.getByTestId('paragraph-guide-analyze')).toBeVisible();
    await expect(
      guides.getByText('The part students skip most').first()
    ).toBeVisible();

    await guides.getByRole('button', { name: /^Argue a position/ }).click();
    await expect(guides.getByTestId('paragraph-guide-argue')).toBeVisible();

    await guides.getByRole('button', { name: /^Compare/ }).click();
    await expect(guides.getByTestId('paragraph-guide-compare')).toBeVisible();

    await guides.getByRole('button', { name: /^Synthesize/ }).click();
    await expect(
      guides.getByTestId('paragraph-guide-synthesize')
    ).toBeVisible();
  });

  test('Class Starter does not offer it', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await expect(
      page.getByRole('group', { name: 'Paragraph types' })
    ).toHaveCount(0);
  });
});
