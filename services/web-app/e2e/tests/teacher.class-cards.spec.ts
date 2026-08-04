import { test, expect } from '../test-setup';

test.describe.serial('Teacher class cards with procedural art', () => {
  test('my classes shows art-based cards without gradients', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/my-classes');
    await page.waitForLoadState('networkidle');

    const card = page
      .locator(`a[href="/app/my-classes/${e2eContext.classId}"]`)
      .first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId('class-art')).toBeVisible();
    await expect(card.getByTestId('class-art')).toHaveCSS(
      'background-image',
      /\/img\/class-art\//
    );
    await expect(card.getByText(/Grade 9th .* Period 1st/)).toBeVisible();

    const gradientCount = await page
      .locator('[class*="bg-gradient-to-br"]')
      .count();
    expect(gradientCount).toBe(0);
  });

  test('dashboard class cards use the same art system', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    const grid = page.getByTestId('teacher-classes-grid');
    await expect(grid).toBeVisible();
    await expect(grid.getByTestId('class-art').first()).toBeVisible();
  });

  test('dashboard and class detail show the same artwork for a class', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    const card = page
      .locator(`a[href="/app/my-classes/${e2eContext.classId}"]`)
      .first();
    await expect(card).toBeVisible();
    const dashboardArt = await card
      .getByTestId('class-art')
      .evaluate((node) => getComputedStyle(node).backgroundImage);

    await card.click();
    await page.waitForURL(`**/app/my-classes/${e2eContext.classId}`);
    const detailArt = await page
      .getByTestId('class-detail-header')
      .getByTestId('class-art')
      .evaluate((node) => getComputedStyle(node).backgroundImage);

    expect(detailArt).toBe(dashboardArt);
  });

  test('clicking a class card opens the class detail page', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/my-classes');
    await page.waitForLoadState('networkidle');

    await page
      .locator(`a[href="/app/my-classes/${e2eContext.classId}"]`)
      .first()
      .click();
    await page.waitForURL(`**/app/my-classes/${e2eContext.classId}`);
  });
});
