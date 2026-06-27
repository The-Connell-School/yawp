import { expect, test } from '@playwright/test';

test.describe('Public accessibility page', () => {
  test('links to accessibility information from the public info footer', async ({
    page,
  }) => {
    await page.goto('/info');

    await expect(
      page.locator('footer').getByRole('link', { name: 'Accessibility' })
    ).toHaveAttribute('href', '/accessibility');
  });

  test('publishes YAWP accessibility status and reporting contact', async ({
    page,
  }) => {
    await page.goto('/accessibility');

    await expect(
      page.getByRole('heading', { name: 'Accessibility at YAWP!' })
    ).toBeVisible();
    await expect(page.getByText('WCAG 2.1 Level AA').first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Known limitations' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Report an accessibility issue' })
    ).toBeVisible();

    const supportLink = page
      .locator('#report')
      .getByRole('link', { name: 'yawp@theconnellschool.com' });
    await expect(supportLink).toHaveAttribute(
      'href',
      /mailto:yawp@theconnellschool\.com/
    );

    await expect(
      page.getByRole('link', { name: 'Student/Teacher Login' })
    ).toHaveAttribute('href', '/auth/login');
  });
});
