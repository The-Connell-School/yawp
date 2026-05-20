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

  test('clicking an assignment title opens the overview on the Submitted tab', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
    await page.waitForLoadState('networkidle');

    // Title link: href ends in /assignments/<id> with no query string.
    // Badge links carry ?tab=… so they don't match this regex.
    const titleLinkSelector = `a[href^="/app/my-classes/${e2eContext.classId}/assignments/"]:not([href*="?"])`;
    const titleLink = page.locator(titleLinkSelector).first();
    await expect(titleLink).toBeVisible();

    await titleLink.click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(
      new RegExp(`/app/my-classes/${e2eContext.classId}/assignments/[^/?]+$`)
    );

    const submittedTab = page.getByRole('tab', { name: 'Submitted' });
    await expect(submittedTab).toHaveAttribute('aria-selected', 'true');
  });

  test('status-badge link opens the overview pre-selected on that tab', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=assignments`);
    await page.waitForLoadState('networkidle');

    const gradedBadgeLink = page
      .locator(`a[href*="/assignments/"][href*="tab=graded"]`)
      .first();
    await gradedBadgeLink.click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/tab=graded/);
    const gradedTab = page.getByRole('tab', { name: 'Graded' });
    await expect(gradedTab).toHaveAttribute('aria-selected', 'true');
  });
});
