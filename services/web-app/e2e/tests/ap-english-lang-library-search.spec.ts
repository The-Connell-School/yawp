import { test, expect } from '../test-setup';

const gettysburgTitle = 'The Gettysburg Address — Rhetorical Analysis';
const schoolStartTitle = 'School Start Times — Synthesis';
const disagreementTitle = 'The Value of Disagreement — Argument';
const roleOfFailureTitle = 'The Role of Failure — Argument';

test.describe.serial('AP English Language prompt library search and filters', () => {
  // Each step drives a loader round trip over the full 35-prompt library.
  test.describe.configure({ timeout: 90_000 });

  test('teacher can search the AP Language prompt library and clear the search', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.apEnglishLangAssignmentTypeId}`
    );

    await expect(
      page.getByRole('heading', { name: 'AP Language Prompt Library' })
    ).toBeVisible();

    // Unfiltered: every prompt is listed.
    await expect(page.getByRole('button', { name: gettysburgTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: schoolStartTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: disagreementTitle })).toBeVisible();

    // Search narrows to matching titles and prompts.
    await page.getByPlaceholder('Search AP Language prompts').fill('Gettysburg');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: gettysburgTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: schoolStartTitle })).toHaveCount(0);
    await expect(page.getByRole('button', { name: disagreementTitle })).toHaveCount(0);

    // The active search shows as a removable chip; removing it restores the list.
    await page.getByRole('button', { name: 'Remove filter “Gettysburg”' }).click();

    await expect(page.getByRole('button', { name: schoolStartTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: disagreementTitle })).toBeVisible();
  });

  test('teacher can stack FRQ type and difficulty filters and clear them', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.apEnglishLangAssignmentTypeId}`
    );

    // Filtering by FRQ type keeps only that question type. The checkboxes mirror
    // URL state the loader refreshes, so click them rather than using check().
    await page.getByRole('checkbox', { name: /^Argument/ }).click();

    await expect(page.getByRole('button', { name: disagreementTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: schoolStartTitle })).toHaveCount(0);
    await expect(page.getByRole('button', { name: gettysburgTitle })).toHaveCount(0);

    // Difficulty stacks on top of the FRQ type filter.
    await page.getByRole('checkbox', { name: /^Developing/ }).click();

    await expect(page.getByRole('button', { name: roleOfFailureTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: disagreementTitle })).toHaveCount(0);

    // Clearing all filters restores the full library.
    await page.getByRole('button', { name: 'Clear all' }).click();

    await expect(page.getByRole('button', { name: gettysburgTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: schoolStartTitle })).toBeVisible();
    await expect(page.getByRole('button', { name: disagreementTitle })).toBeVisible();
  });

  test('teacher can still select a filtered AP Language prompt to create an assignment', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.apEnglishLangAssignmentTypeId}?ael_q=Gettysburg`
    );

    await page.getByRole('button', { name: gettysburgTitle }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Selected AP Language Prompt')).toBeVisible();
    await expect(dialog.getByText(gettysburgTitle)).toBeVisible();
  });

  test('no matching prompts renders an empty state instead of the list', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.apEnglishLangAssignmentTypeId}?ael_q=zzzznotaprompt`
    );

    await expect(
      page.getByText('No AP Language prompts match the current filters.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: gettysburgTitle })).toHaveCount(0);
  });
});
