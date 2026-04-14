import { test, expect } from '../test-setup';

test.describe.serial('Teacher class page Essay column', () => {
  test('shows submission title not document title in Submitted tab', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/my-classes/${e2eContext.classId}?tab=to-grade`
    );
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('cell', { name: 'E2E Essay submission title' })
    ).toBeVisible();
    await expect(page.getByText('E2E Document workspace title')).toHaveCount(
      0
    );

    const viewHref = await page
      .getByRole('link', { name: /^view$/i })
      .first()
      .getAttribute('href');
    expect(viewHref).toMatch(/\/app\/submissions\/[^/]+\?edit=1/);
  });
});
