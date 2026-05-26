import { expect, test } from '../test-setup';

test.describe.serial('Teacher assignment creation fields', () => {
  test('does not expose Tutor Context in assignment creation dialogs', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await page.goto('/app?tab=assignments');
    await page.getByRole('button', { name: /create assignment/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/tutor context/i)).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
    await page.getByRole('button', { name: /create new assignment/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/tutor context/i)).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.goto(`/app/assignment-types/${e2eContext.assignmentTypeId}`);
    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/tutor context/i)).toHaveCount(0);
  });
});
