import { test, expect } from '../test-setup';
import { fillMyAssignmentsSearch } from '../test-helpers';

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
    // Pagination is 20 per page, and other shards share the E2E database, so
    // the seeded title may sit off the first page unless we narrow the list.
    await fillMyAssignmentsSearch(page, 'E2E Class Assignment');
    // Exact, because the row's selection checkbox is itself a cell whose
    // accessible name ("Select assignment E2E Class Assignment") contains the
    // title, and the default substring match picks up both.
    await expect(
      page.getByTestId(`my-assignment-open-${e2eContext.assignmentId}`)
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
    await fillMyAssignmentsSearch(page, 'E2E Class Assignment');

    await page
      .getByRole('link', { name: 'E2E Class Assignment', exact: true })
      .click();

    await page.waitForURL(
      `**/app/assignments/${e2eContext.assignmentId}?classId=${e2eContext.classId}`,
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
