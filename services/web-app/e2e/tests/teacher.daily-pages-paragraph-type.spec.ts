import { test, expect } from '../test-setup';

/**
 * The kind of paragraph a Daily Pages entry practices. Offered only for Daily
 * Pages, and only the types switched on — Analyze, then Argue a position.
 * "Any kind of paragraph" is the default, which grades and tutors as before.
 */
test.describe.serial('Paragraph type at assignment creation', () => {
  test('Daily Pages offers Analyze and Argue a position, defaulting to any kind of paragraph', async ({
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
    await expect(page.getByRole('dialog')).toBeVisible();

    const select = page.getByLabel('Paragraph type');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('');
    await expect(select.locator('option')).toHaveText([
      'Any kind of paragraph',
      'Analyze',
      'Argue a position',
    ]);

    await select.selectOption('analyze');
    await expect(
      page.getByText(/Claim-Evidence-Analysis/).first()
    ).toBeVisible();

    await select.selectOption('argue');
    await expect(page.getByText(/Position-Reason-Test/).first()).toBeVisible();
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
    await page.getByRole('menuitem', { name: 'Argue a position' }).click();

    await page.waitForURL(/\/app\/documents\//);
    await expect(page.getByTestId('document-title-input')).toHaveValue(
      'Argue a position'
    );
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

    await expect(page.getByLabel('Paragraph type')).toHaveCount(0);
  });
});
