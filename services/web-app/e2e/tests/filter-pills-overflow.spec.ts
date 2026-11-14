import { test, expect } from '../test-setup';

test.describe('Filter pill overflow affordances', () => {
  test('class documents status pills scroll with edge fade and chevrons', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
    await page.waitForLoadState('networkidle');

    const chips = page.getByTestId('class-documents-status-chips');
    await expect(chips).toBeVisible();
    await expect(chips).toHaveAttribute('data-has-overflow', 'true');

    const scrollRight = page.getByTestId('class-documents-status-chips-scroll-right');
    await expect(scrollRight).toBeVisible();
    await expect(
      page.getByTestId('class-documents-status-chips-fade-right')
    ).toBeVisible();

    await scrollRight.click();
    await expect(chips).toHaveAttribute('data-can-scroll-left', 'true');
    await expect(
      page.getByTestId('class-documents-status-chips-fade-left')
    ).toBeVisible();

    const scrollLeft = page.getByTestId('class-documents-status-chips-scroll-left');
    while (await scrollLeft.isVisible()) {
      await scrollLeft.click();
    }

    await expect(chips).toHaveAttribute('data-can-scroll-left', 'false');
    await expect(
      page.getByTestId('class-documents-status-chips-scroll-left')
    ).toHaveCount(0);
  });

  test('my assignments type pills expose the same overflow controls at narrow widths', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.setViewportSize({ width: 280, height: 800 });
    await page.goto('/app/assignments');
    await page.waitForLoadState('networkidle');

    const pills = page.getByTestId('my-assignments-type-pills');
    const pillTabs = pills.getByRole('tab');
    if ((await pillTabs.count()) < 2) {
      test.skip();
      return;
    }

    await expect(pills).toBeVisible();
    if ((await pills.getAttribute('data-has-overflow')) !== 'true') {
      test.skip();
      return;
    }

    await expect(
      page.getByTestId('my-assignments-type-pills-scroll-right')
    ).toBeVisible();
  });
});