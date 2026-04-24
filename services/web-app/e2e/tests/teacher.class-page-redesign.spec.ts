import { test, expect } from '../test-setup';

test.describe.serial('Teacher class page redesign - simplified tabs', () => {
  test('shows only Students and Assignments tabs', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: /students/i })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: /assignments/i })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: /in progress/i })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /submitted/i })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /graded/i })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /released/i })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /paste activity/i })).toHaveCount(0);
  });

  test('defaults to Students tab', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page.waitForLoadState('networkidle');

    const studentsTab = page.getByRole('tab', { name: /students/i });
    await expect(studentsTab).toHaveAttribute('data-state', 'active');
  });

  test('shows Create New Assignment button above the table', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /create new assignment/i })
    ).toBeVisible();
  });

  test('can switch to Assignments tab', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: /assignments/i }).click();
    await page.waitForLoadState('networkidle');

    const assignmentsTab = page.getByRole('tab', { name: /assignments/i });
    await expect(assignmentsTab).toHaveAttribute('data-state', 'active');
  });
});
