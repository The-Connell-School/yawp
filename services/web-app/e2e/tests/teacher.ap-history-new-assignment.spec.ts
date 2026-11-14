import { test, expect } from '../test-setup';
import { setFeatureFlag } from '../feature-flags';

// Regression: an "AP History Essay" button sat beside New Assignment on the
// Assignments tab of every class in a school with AP History enabled (an
// English 10 class included), and clicking it left the class for the AP prompt
// library. Classes carry no subject, so "AP History is available here" was
// true of every class. Behind `ap-history-in-new-assignment`, AP History is
// one of the types in the class's New Assignment sheet instead, and choosing
// it opens the library with the class already picked.

test.describe.serial('AP History from a class New Assignment sheet', () => {
  test.afterAll(async () => {
    await setFeatureFlag('ap-history-in-new-assignment', false);
  });

  test('flag off: the class toolbar keeps its AP History Essay link', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('ap-history-in-new-assignment', false);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);

    await expect(
      page.getByRole('link', { name: 'AP History Essay' })
    ).toHaveAttribute(
      'href',
      `/app/assignment-types/${e2eContext.apHistoryAssignmentTypeId}?classId=${e2eContext.classId}`
    );
  });

  test('flag on: no stray AP History entry; New Assignment offers it and opens the library for this class', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('ap-history-in-new-assignment', true);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);

    await expect(page.getByTestId('new-assignment-button')).toBeVisible();
    // The bug: this entry showed in every class's assignments view.
    await expect(
      page.getByRole('link', { name: 'AP History Essay' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'AP History Essay' })
    ).toHaveCount(0);

    await page.getByTestId('new-assignment-button').click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'New Assignment' })
    ).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Assignment type' }).click();
    const apOption = page.getByRole('option', { name: /AP History Essay/ });
    await expect(apOption).toBeVisible();
    await expect(apOption).toContainText('Opens the AP prompt library');
    await apOption.click();

    await expect(page).toHaveURL(
      new RegExp(
        `/app/assignment-types/${e2eContext.apHistoryAssignmentTypeId}\\?classId=${e2eContext.classId}$`
      )
    );
    await expect(
      page.getByRole('heading', { name: 'AP History Essay', level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Prompt Library' })
    ).toBeVisible();

    // Arriving from the class still preselects that class, and only it.
    await page
      .getByRole('button', { name: /Civil War & Reconstruction/ })
      .click();
    const libraryDialog = page.getByRole('dialog');
    await expect(
      libraryDialog.locator(`#ap-library-class-${e2eContext.classId}`)
    ).toBeChecked();
    await expect(
      libraryDialog.getByRole('checkbox', { checked: true })
    ).toHaveCount(1);
  });

  test('flag on: the other assignment types still create in place', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('ap-history-in-new-assignment', true);
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);

    await page.getByTestId('new-assignment-button').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Assignment type' }).click();
    await page.getByRole('option', { name: /^Daily Pages/ }).first().click();
    await expect(page).toHaveURL(
      new RegExp(`/app/my-classes/${e2eContext.classId}\\?tab=assignments`)
    );
    await expect(
      dialog.getByRole('combobox', { name: 'Assignment type' })
    ).toContainText('Daily Pages');
  });
});
