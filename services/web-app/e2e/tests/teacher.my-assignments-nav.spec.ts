import { test, expect } from '../test-setup';
import { openMyAssignmentDetail } from '../test-helpers';

test.describe('Teacher "My Assignments" sidebar navigation', () => {
  test.setTimeout(120_000);
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
      page.getByRole('heading', { name: 'My Assignments', exact: true })
    ).toBeVisible();
    await openMyAssignmentDetail(
      page,
      e2eContext.assignmentId,
      e2eContext.classId
    );
  });

  test('clicking an assignment row opens that assignment detail page', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openMyAssignmentDetail(
      page,
      e2eContext.assignmentId,
      e2eContext.classId
    );
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
