import { test, expect } from '../test-setup';

test.describe('Teacher "My Assignments" sidebar navigation', () => {
  test('teacher can open My Assignments from the sidebar and see their assignments', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.waitForURL('**/app**', { timeout: 15000 });

    const navLink = page.getByRole('link', { name: 'My Assignments' });
    await expect(navLink).toBeVisible();
    await navLink.click();

    await page.waitForURL('**/app/assignments**', { timeout: 15000 });
    await expect(
      page.getByRole('cell', { name: 'E2E Class Assignment' })
    ).toBeVisible();
  });

  test('clicking an assignment row opens that assignment detail page', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/assignments');
    await page.waitForLoadState('networkidle');

    await page
      .getByRole('link', { name: /E2E Class Assignment/i })
      .click();

    await page.waitForURL(
      `**/app/my-classes/${e2eContext.classId}/assignments/${e2eContext.assignmentId}`,
      { timeout: 15000 }
    );
    await expect(page.getByTestId('assignment-detail-page')).toBeVisible();
  });

  test('student does not see My Assignments in the sidebar', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.waitForURL('**/app**', { timeout: 15000 });

    await expect(
      page.getByRole('link', { name: 'My Assignments' })
    ).toHaveCount(0);
  });
});
