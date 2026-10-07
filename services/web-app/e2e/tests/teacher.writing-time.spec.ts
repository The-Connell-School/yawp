import { test, expect } from '../test-setup';
import { setWritingConditionsFlag } from '../feature-flags';

/**
 * How long students have to write. The grading assistant and the grammar
 * checker calibrate to it, so the creation form suggests the time each kind of
 * timed writing is built around and leaves every other type blank.
 */
test.describe.serial('Writing time at assignment creation', () => {
  // The e2eContext fixture loads E2E_DATABASE_URL into the worker.
  test.beforeEach(async ({ e2eContext }) => {
    void e2eContext;
    await setWritingConditionsFlag(true);
  });
  test.afterAll(async () => {
    await setWritingConditionsFlag(false);
  });

  async function openCreationSheet(
    page: import('@playwright/test').Page,
    assignmentTypeId: string
  ) {
    await page.goto(`/app/assignment-types/${assignmentTypeId}`);
    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    return page.getByLabel('Time students have to write');
  }

  test('Daily Pages suggests fifteen minutes, and the teacher can change it', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    const field = await openCreationSheet(
      page,
      e2eContext.dailyPagesAssignmentTypeId
    );

    await expect(field).toHaveValue('15');
    await field.fill('10');
    await expect(field).toHaveValue('10');
    await field.fill('');
    await expect(field).toHaveValue('');
  });

  test('Class Starter suggests ten minutes', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    const field = await openCreationSheet(
      page,
      e2eContext.classStarterAssignmentTypeId
    );

    await expect(field).toHaveValue('10');
  });
});

// The flag starts off in production: neither setting is offered, and the
// creation form looks as it did before they existed.
test.describe.serial('With the writing-conditions flag off', () => {
  // The e2eContext fixture loads E2E_DATABASE_URL into the worker.
  test.beforeEach(async ({ e2eContext }) => {
    void e2eContext;
    await setWritingConditionsFlag(false);
  });

  test('Daily Pages offers neither paragraph type nor writing time', async ({
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
    await expect(dialog.getByLabel('Prompt', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Paragraph type')).toHaveCount(0);
    await expect(page.getByLabel('Time students have to write')).toHaveCount(0);
  });
});
