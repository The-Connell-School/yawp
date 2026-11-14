import { test, expect } from '../test-setup';

test.describe('AP History retirement on class Assignments', () => {
  test('never shows an AP History Essay chip or library entry', async ({
    page,
    e2eContext,
    signIn: signInFn,
  }) => {
    await signInFn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);

    await expect(page.getByTestId('new-assignment-button')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'AP History Essay' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'AP History Essay' })
    ).toHaveCount(0);
    await expect(page.getByText('AP History Essay')).toHaveCount(0);
  });

  test('direct assignment-type URL returns not found', async ({
    page,
    e2eContext,
    signIn: signInFn,
  }) => {
    await signInFn(e2eContext.teacherEmail, 'teacher-e2e-password');
    const response = await page.goto(
      `/app/assignment-types/${e2eContext.apHistoryAssignmentTypeId}`
    );
    expect(response?.status()).toBe(404);
  });
});