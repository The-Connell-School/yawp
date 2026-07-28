import { test, expect } from '../test-setup';

// Matches the deterministic fixture the generator route returns in E2E.
const draftTitle = 'What We Owe Strangers';
const draftPrompt =
  'Communities are held together by obligations nobody signed up for.';

test.describe.serial('AP English Language prompt generator', () => {
  // Each step drives a loader round trip over the full library.
  test.describe.configure({ timeout: 90_000 });

  test('teacher gets a New menu with document, assignment, and prompt generator', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.apEnglishLangAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /^New/ }).click();

    await expect(page.getByRole('menuitem', { name: 'Document' })).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: 'Assignment' })
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: 'Prompt generator' })
    ).toBeVisible();
  });

  test('generator drafts a prompt and offers save and use', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.apEnglishLangAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Prompt generator' }).click();

    const sheet = page.getByRole('dialog');
    await expect(
      sheet.getByRole('heading', { name: 'Prompt generator' })
    ).toBeVisible();

    await sheet
      .getByPlaceholder('Describe the prompt you want')
      .fill('Something about obligation');
    await sheet.getByRole('button', { name: 'Send' }).click();

    await expect(sheet.getByRole('heading', { name: draftTitle })).toBeVisible();
    await expect(sheet.getByText(draftPrompt)).toBeVisible();

    // Both actions the teacher needs are on the drafted option.
    await expect(
      sheet.getByRole('button', { name: 'Save prompt' })
    ).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Use prompt' })
    ).toBeVisible();

    // Saving is acknowledged in place.
    await sheet.getByRole('button', { name: 'Save prompt' }).click();
    await expect(sheet.getByRole('button', { name: 'Saved' })).toBeVisible();
  });

  test('a saved prompt appears in the library under My prompts', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    // The previous test saved this draft; it now belongs to the library.
    await page.goto(
      `/app/assignment-types/${e2eContext.apEnglishLangAssignmentTypeId}?ael_coll=mine`
    );

    await expect(
      page.getByRole('button', { name: new RegExp(draftTitle) })
    ).toBeVisible();
    // Curated entries are filtered out by the collection facet.
    await expect(
      page.getByRole('button', {
        name: /The Gettysburg Address — Rhetorical Analysis/,
      })
    ).toHaveCount(0);
  });

  test('New > Assignment opens the real assignment form and creates one', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.apEnglishLangAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();

    // The shared form every other course uses, not a stripped-down one.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Assignment type')).toBeVisible();
    await expect(dialog.getByText('Assign to')).toBeVisible();
    await expect(dialog.getByText('Prompt Source')).toBeVisible();

    await dialog.getByLabel('Title (optional)').fill('Typed AP Lang');
    await dialog
      .getByLabel('Prompt', { exact: true })
      .fill('Write an essay that argues your position on what we owe strangers.');
    await dialog.getByRole('checkbox').first().check();

    const created = page.waitForResponse(
      (response) =>
        response.url().includes('/api/assignments/create') &&
        response.status() === 200
    );
    await dialog.getByRole('button', { name: /Create Assignment/ }).click();
    await created;
    await expect(dialog).toHaveCount(0);
  });

  test('the selected-prompt form is the real assignment form', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.apEnglishLangAssignmentTypeId}?ael_q=Gettysburg`
    );

    await page
      .getByRole('button', {
        name: /The Gettysburg Address — Rhetorical Analysis/,
      })
      .click();

    const dialog = page.getByRole('dialog');
    // Same controls as the shared form…
    await expect(dialog.getByText('Assignment type')).toBeVisible();
    await expect(dialog.getByText('Assign to')).toBeVisible();
    await expect(dialog.getByText('Submit for grade')).toBeVisible();
    // …with the chosen prompt locked in place of the prompt-source controls.
    await expect(dialog.getByText('Selected AP Language Prompt')).toBeVisible();
    await expect(dialog.getByText('Prompt Source')).toHaveCount(0);
  });

  test('using a generated prompt starts an assignment from it', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.apEnglishLangAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Prompt generator' }).click();

    const sheet = page.getByRole('dialog');
    await sheet
      .getByPlaceholder('Describe the prompt you want')
      .fill('Something about obligation');
    await sheet.getByRole('button', { name: 'Send' }).click();
    await expect(sheet.getByRole('heading', { name: draftTitle })).toBeVisible();

    await sheet.getByRole('button', { name: 'Use prompt' }).click();

    // The generator hands off to the assignment sheet with the draft selected.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Selected AP Language Prompt')).toBeVisible();
    await expect(dialog.getByText(draftTitle)).toBeVisible();
  });
});
