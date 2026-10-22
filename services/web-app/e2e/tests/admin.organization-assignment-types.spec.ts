import { test, expect } from '../test-setup';

test.describe.serial('Admin organization assignment types', () => {
  test('marks organization assignment type editing as moved to Internal', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    await page.goto(`/app/admin/organizations/${e2eContext.organizationId}`);

    await expect(
      page.getByText(
        'Organization create/update writes have moved to Yawp! Internal.'
      )
    ).toBeVisible();
    const editButton = page.getByRole('button', {
      name: 'Edit Organization',
    });
    await expect(editButton).toBeDisabled();
    await expect(editButton).toHaveAttribute(
      'title',
      'Edit organizations in Yawp! Internal'
    );
  });
});
